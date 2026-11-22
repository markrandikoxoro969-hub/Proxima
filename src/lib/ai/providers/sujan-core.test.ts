// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../types";
import { createSujanCoreProvider } from "./sujan-core";

const URL_ = "https://ai.example.test/chat";
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(...responses: (Response | Error)[]) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const provider = createSujanCoreProvider({
    url: URL_,
    fetchImpl: fetchImpl as typeof fetch,
    retryDelayMs: 1,
  });
  return { provider, fetchImpl };
}
const request = (signal = new AbortController().signal) => ({ message: "Hi", sessionId: "s1", signal });

describe("sujan-core provider", () => {
  it("POSTs { message, session_id } and returns the reply", async () => {
    const { provider, fetchImpl } = setup(ok({ reply: "  Hello!  " }));
    await expect(provider.complete!(request())).resolves.toBe("Hello!");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "Hi", session_id: "s1" });
  });

  it("puts the system prompt (and so the answer mode) above the message", async () => {
    const { provider, fetchImpl } = setup(ok({ reply: "ok" }));
    await provider.complete!({ ...request(), system: "Mode: Coding.\nReturn runnable code." });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { message: string };
    expect(body.message.startsWith("Mode: Coding.")).toBe(true);
    expect(body.message.endsWith("Hi")).toBe(true);
  });

  it("tells the text-only fallback when it cannot see a provided photo", async () => {
    const { provider, fetchImpl } = setup(ok({ reply: "Please describe it." }));
    await provider.complete!({
      ...request(),
      images: [{ dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 1, height: 1 }],
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { message: string };
    expect(body.message).toContain("cannot see the provided pictures");
    expect(body.message).not.toContain("base64");
  });

  it("retries once when Render is restarting (503)", async () => {
    const { provider, fetchImpl } = setup(ok({}, 503), ok({ reply: "Back!" }));
    await expect(provider.complete!(request())).resolves.toBe("Back!");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["HTTP errors", ok({ error: "x" }, 500), "upstream"],
    ["wrong format", ok({ answer: "x" }), "bad_response"],
    ["empty reply", ok({ reply: "   " }), "bad_response"],
    ["network failure", new TypeError("fetch failed"), "unavailable"],
  ])("maps %s to a clear error code", async (_label, response, code) => {
    const { provider } = setup(response);
    await expect(provider.complete!(request())).rejects.toMatchObject({ name: "AiProviderError", code });
  });

  it("reports timeouts as 'timeout'", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort(new DOMException("slow", "TimeoutError"));
      throw new DOMException("aborted", "AbortError");
    });
    const provider = createSujanCoreProvider({ url: URL_, fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await provider.complete!(request(controller.signal)).catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.code).toBe("timeout");
  });
});
