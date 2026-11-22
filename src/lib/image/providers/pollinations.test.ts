import { describe, expect, it, vi } from "vitest";
import { createPollinationsImageProvider } from "./pollinations";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const image = {
  bytes: new Uint8Array(Buffer.from(png, "base64")),
  mime: "image/png",
  dataUrl: `data:image/png;base64,${png}`,
};
const signal = () => new AbortController().signal;
const response = () => Response.json({ data: [{ b64_json: png }] });

describe("Pollinations images", () => {
  it("generates with a secret header and the requested size", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response());
    const provider = createPollinationsImageProvider({ apiKey: "sk_test", fetchImpl });
    const result = await provider.generate({ prompt: "a boat", width: 1280, height: 720, signal: signal() });
    expect(result).toMatchObject({ mime: "image/png", width: 1, height: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://gen.pollinations.ai/v1/images/generations");
    expect(init.headers).toEqual({ Authorization: "Bearer sk_test", "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      model: "black-forest-labs/flux.1-schnell",
      prompt: "a boat",
      size: "1280x720",
      n: 1,
      response_format: "b64_json",
    });
    expect(init.redirect).toBe("error");
    expect(url).not.toContain("sk_test");
  });

  it("uploads the actual source image to the edit endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response());
    const provider = createPollinationsImageProvider({ apiKey: "sk_test", fetchImpl });
    const result = await provider.edit!({
      prompt: "make it blue",
      width: 1,
      height: 1,
      image,
      strength: 0.5,
      signal: signal(),
    });
    expect(result.mime).toBe("image/png");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://gen.pollinations.ai/v1/images/edits");
    expect(init.headers).toEqual({ Authorization: "Bearer sk_test" });
    const form = init.body as FormData;
    expect(form.get("model")).toBe("black-forest-labs/flux.2-klein-4b");
    expect(form.get("size")).toBe("256x256");
    expect(form.get("prompt")).toBe("make it blue");
    expect(new Uint8Array(await (form.get("image") as File).arrayBuffer())).toEqual(image.bytes);
  });

  it("handles missing keys, upstream errors and malformed responses without exposing secrets", async () => {
    const request = { prompt: "x", width: 1024, height: 1024, signal: signal() };
    await expect(createPollinationsImageProvider({ apiKey: "" }).generate(request)).rejects.toMatchObject({
      code: "unavailable",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("sk_secret", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ data: [{ b64_json: "<svg>" }] }))
      .mockResolvedValueOnce(new Response("not json"));
    const provider = createPollinationsImageProvider({ apiKey: "sk_secret", fetchImpl });
    const error = await provider.generate(request).catch((e) => e);
    expect(error).toMatchObject({ code: "upstream", status: 401 });
    expect(error.message).not.toContain("sk_secret");
    await expect(provider.generate(request)).rejects.toMatchObject({ code: "bad_response" });
    await expect(provider.generate(request)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("reports timeouts and cancellation without retrying", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("deadline", "TimeoutError"));
    const fetchImpl = vi.fn().mockRejectedValue(new Error("request failed"));
    const provider = createPollinationsImageProvider({ apiKey: "sk_test", fetchImpl });
    await expect(
      provider.generate({ prompt: "x", width: 1024, height: 1024, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "timeout" });
    const stopped = new AbortController();
    stopped.abort();
    await expect(
      provider.generate({ prompt: "x", width: 1024, height: 1024, signal: stopped.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
  });
});
