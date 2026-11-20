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
