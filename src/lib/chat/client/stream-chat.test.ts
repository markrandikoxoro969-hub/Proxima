import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./stream-chat";

const sse = (...events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

function handlers() {
  return {
    onMeta: vi.fn(),
    onStatus: vi.fn(),
    onText: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onAbort: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("streamChat", () => {
  it("reports meta → text → done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse(
          ["meta", { mode: "user", conversationId: "c1", title: "Hi", userMessageId: "u1" }],
          ["status", { state: "thinking" }],
          ["token", { text: "Hel" }],
          ["token", { text: "lo" }],
          ["done", { messageId: "m1", latencyMs: 120, source: "mock" }],
        ),
      ),
    );
    const h = handlers();
    await streamChat({ message: "Hi" }, h);
    expect(h.onMeta).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1" }));
    expect(h.onText.mock.calls.map((c) => c[0]).join("")).toBe("Hello");
    expect(h.onDone).toHaveBeenCalledWith({ messageId: "m1", latencyMs: 120, source: "mock" });
    expect(h.onError).not.toHaveBeenCalled();
  });

  it.each(["done", "error"])("finishes on %s even when the SSE connection stays open", async (terminal) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const payload =
          terminal === "done"
            ? { messageId: "m", latencyMs: 1, source: "test" }
            : { code: "upstream", message: "Error", retryable: true };
        controller.enqueue(
          new TextEncoder().encode(
            `event: token\ndata: {"text":"complete code"}\n\nevent: ${terminal}\ndata: ${JSON.stringify(payload)}\n\n`,
          ),
        );
      },
      cancel,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    const h = handlers();
    await streamChat({ message: "code" }, h);
    expect(h.onText).toHaveBeenCalledWith("complete code");
    expect(terminal === "done" ? h.onDone : h.onError).toHaveBeenCalledOnce();
    expect(terminal === "done" ? h.onError : h.onDone).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("flushes file text before reporting the next file status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse(
          ["token", { text: "first file" }],
          ["status", { state: "thinking", message: "Writing next file" }],
          ["done", { messageId: null, latencyMs: 1, source: "mock" }],
        ),
      ),
    );
    const order: string[] = [];
    const h = handlers();
    h.onText.mockImplementation(() => order.push("text"));
    h.onStatus.mockImplementation(() => order.push("status"));
    await streamChat({ message: "code" }, h);
    expect(order).toEqual(["text", "status"]);
  });

  it("delivers file previews in order without appending them to saved text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse(
          ["token", { text: "first" }],
          ["file-preview", { path: "src/b.ts", text: "draft" }],
          ["file-preview", { path: "src/b.ts", text: "" }],
          ["token", { text: "second" }],
          ["done", { messageId: null, latencyMs: 1, source: "mock" }],
        ),
      ),
    );
    const events: string[] = [];
    const h = handlers();
    h.onText.mockImplementation((text) => events.push(`text:${text}`));
    await streamChat(
      { message: "code" },
      { ...h, onFilePreview: (data) => events.push(`preview:${data.text}`) },
    );
    expect(events).toEqual(["text:first", "preview:draft", "preview:", "text:second"]);
  });

  it("automatically continues checkpointed files in fresh requests without duplicating saved text", async () => {
    const responses = [
      sse(
        ["meta", { mode: "user", conversationId: "c1", title: "T", userMessageId: "u1" }],
        ["token", { text: "file one\n" }],
        ["coding-continue", { conversationId: "c1", completedFiles: 1, retry: false }],
      ),
      sse(
        [
          "meta",
          { mode: "user", conversationId: "c1", title: "T", userMessageId: "u1", resumeText: "file one\n" },
        ],
        ["token", { text: "file two\n" }],
        ["done", { messageId: "m1", latencyMs: 5, source: "mock", text: "file one\nfile two\n" }],
      ),
    ];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return responses.shift()!;
    });
    vi.stubGlobal("fetch", fetch);
    const h = handlers();
    await streamChat({ message: "Build a project", mode: "coding" }, h);
    expect(fetch).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(fetch.mock.calls[1][1]?.body));
    expect(second).toMatchObject({
      conversationId: "c1",
      retry: true,
      codingContinue: true,
      codingStep: true,
    });
    expect(h.onMeta).toHaveBeenCalledOnce();
    expect(h.onText.mock.calls.map((c) => c[0]).join("")).toBe("file one\nfile two\n");
    expect(h.onDone).toHaveBeenCalledOnce();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("automatically retries a timed-out file at most twice", async () => {
    const fetch = vi.fn(async () =>
      sse(["coding-continue", { conversationId: "c1", completedFiles: 1, retry: true }]),
    );
    vi.stubGlobal("fetch", fetch);
    const h = handlers();
    await streamChat({ message: "Build project", mode: "coding" }, h);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "timeout", retryable: true }));
    expect(h.onDone).not.toHaveBeenCalled();
  });

  it("does not continue a non-advancing file checkpoint", async () => {
    const fetch = vi.fn(async () =>
      sse(["coding-continue", { conversationId: "c1", completedFiles: 1, retry: false }]),
    );
    vi.stubGlobal("fetch", fetch);
    const h = handlers();
    await streamChat({ message: "project" }, h);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "interrupted" }));
  });

  it("stops before the next file when cancelled at a checkpoint", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () =>
      sse(
        ["token", { text: "one" }],
        ["coding-continue", { conversationId: "c1", completedFiles: 1, retry: false }],
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const h = handlers();
    h.onStatus.mockImplementation(() => controller.abort());
    await streamChat({ message: "project" }, { ...h, signal: controller.signal });
    expect(fetch).toHaveBeenCalledOnce();
    expect(h.onAbort).toHaveBeenCalledOnce();
  });

  it("turns HTTP errors (e.g. rate limit) into a friendly error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "rate_limited", message: "Slow down a little." } }, { status: 429 }),
      ),
    );
    const h = handlers();
    await streamChat({ message: "Hi" }, h);
    expect(h.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "rate_limited", message: "Slow down a little.", retryable: true }),
    );
  });

  it("reports a dropped connection when the stream ends early", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sse(["token", { text: "partial" }])),
    );
    const h = handlers();
    await streamChat({ message: "Hi" }, h);
    expect(h.onText).toHaveBeenCalledWith("partial");
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "interrupted" }));
  });

  it("reports offline when the request can't be sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const h = handlers();
    await streamChat({ message: "Hi" }, h);
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "offline" }));
  });

  it("calls onAbort when the user presses Stop", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }),
    );
    const h = handlers();
    await streamChat({ message: "Hi" }, { ...h, signal: controller.signal });
    expect(h.onAbort).toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });
});
