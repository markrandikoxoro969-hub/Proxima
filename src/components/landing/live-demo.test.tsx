import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveDemo } from "./live-demo";

const sse = (...events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

const okReply = (text: string) =>
  sse(
    ["meta", { mode: "guest", conversationId: null, title: null, userMessageId: null }],
    ["delta", { text }],
    ["done", { messageId: null, latencyMs: 10, source: "mock" }],
  );

const bodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

afterEach(() => vi.unstubAllGlobals());

describe("<LiveDemo />", () => {
  it("sends a suggestion as a guest and streams the reply", async () => {
    const fetchMock = vi.fn(async () => okReply("Black holes are very dense."));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDemo />);

    await userEvent.click(screen.getByRole("button", { name: "Explain black holes simply" }));
    expect(await screen.findByText(/Black holes are very dense\./)).toBeInTheDocument();

    const [body] = bodies(fetchMock);
    expect(body.message).toBe("Explain black holes simply");
    expect(body.demoSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.conversationId).toBeUndefined(); // guests never send a conversation
  });

  it("keeps the same demo session for follow-ups, and a new one after New demo", async () => {
    const fetchMock = vi.fn(async () => okReply("ok"));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDemo />);
    const input = screen.getByLabelText("Message Proxima (demo)");

    await userEvent.type(input, "one{Enter}");
    await screen.findAllByText("ok");
    await userEvent.type(input, "two{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: /new demo/i }));
    await userEvent.type(input, "three{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [a, b, c] = bodies(fetchMock);
    expect(b.demoSessionId).toBe(a.demoSessionId);
    expect(c.demoSessionId).not.toBe(a.demoSessionId);
  });

  it("explains the guest rate limit and offers sign-in (no pointless retry)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "rate_limited",
              message: "You're sending messages too fast. Try again in a minute.",
            },
          },
          { status: 429 },
        ),
      ),
    );
    render(<LiveDemo />);
    await userEvent.type(screen.getByLabelText("Message Proxima (demo)"), "hi{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/too fast/);
    expect(screen.getByRole("link", { name: "Sign in for more" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fapp",
    );
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("Try again resends after a temporary failure without duplicating the question", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse(["error", { code: "timeout", message: "Took too long.", retryable: true }]))
      .mockResolvedValueOnce(okReply("Second time lucky"));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDemo />);
    await userEvent.type(screen.getByLabelText("Message Proxima (demo)"), "hello{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Second time lucky")).toBeInTheDocument();
    expect(screen.getAllByText("hello")).toHaveLength(1);
  });

  it("blocks messages over 500 characters", () => {
    render(<LiveDemo />);
    const input = screen.getByLabelText("Message Proxima (demo)");
    fireEvent.change(input, { target: { value: "a".repeat(501) } });
    expect(screen.getByText("501/500")).toHaveClass("text-red-500");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("Stop ends the reply", async () => {
    let abortSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            abortSignal = init.signal ?? undefined;
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    render(<LiveDemo />);
    await userEvent.type(screen.getByLabelText("Message Proxima (demo)"), "long question{Enter}");
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Stop reply" }));
    });
    expect(abortSignal?.aborted).toBe(true);
    expect(await screen.findByText("Stopped.", { selector: "p.text-xs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("shows user text as plain text, never HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okReply("ok")),
    );
    const { container } = render(<LiveDemo />);
    await userEvent.type(
      screen.getByLabelText("Message Proxima (demo)"),
      "<img src=x onerror=alert(1)>{Enter}",
    );
    await screen.findAllByText("ok");
    expect(container.querySelector("img")).toBeNull();
  });
});
