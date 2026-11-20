import { describe, expect, it, vi } from "vitest";
import { buildImagePrompt, findImageStyle, IMAGE_LIMITS } from "./limits";
import { createFallbackImageProvider } from "./providers/chain";
import { createMockImageProvider, mockEditSvg, mockImageSvg, wrapPrompt } from "./providers/mock";
import { createNvidiaImageProvider, snapNvidiaSize } from "./providers/nvidia";
import { createOpenAiImageProvider, openAiSizeFor } from "./providers/openai";
import { createPollinationsImageProvider } from "./providers/pollinations";
import { ImageProviderError, type ImageProvider } from "./types";

const signal = () => new AbortController().signal;

/** A real 1×1 PNG, so sniffing and size reading work. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const pngBytes = () => Uint8Array.from(Buffer.from(PNG_BASE64, "base64"));
const pngDataUrl = () => `data:image/png;base64,${PNG_BASE64}`;

describe("prompt building", () => {
  it("adds the chosen style and clamps the length", () => {
    expect(buildImagePrompt("  a red  boat ")).toBe("a red boat");
    expect(buildImagePrompt("a red boat", "photo")).toContain("photorealistic");
    expect(findImageStyle("nope")).toBeNull();
    expect(buildImagePrompt("x".repeat(5000)).length).toBe(IMAGE_LIMITS.promptMax);
  });
});

describe("offline preview engine", () => {
  const provider = createMockImageProvider();

  it("draws a card with the prompt and escapes markup", async () => {
    const picture = await provider.generate({
      prompt: '<script>alert("x")</script> a castle',
      width: 512,
      height: 512,
      signal: signal(),
    });
    const svg = new TextDecoder().decode(picture.bytes);
    expect(picture.mime).toBe("image/svg+xml");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(picture.width).toBe(512);
  });

  it("shows the original picture when editing", async () => {
    const picture = await provider.edit!({
      prompt: "make it snowy",
      width: 640,
      height: 480,
      image: { bytes: pngBytes(), mime: "image/png", dataUrl: pngDataUrl() },
      strength: 0.6,
      signal: signal(),
    });
    const svg = new TextDecoder().decode(picture.bytes);
    expect(svg).toContain('<image href="data:image/png;base64,');
    expect(svg).toContain("make it snowy");
    expect(picture.width).toBe(640);
  });

  it("wraps long prompts into at most three lines", () => {
    expect(wrapPrompt("one two three four five six seven eight nine ten", 10, 3).length).toBeLessThanOrEqual(
      3,
    );
    expect(mockImageSvg("short", 64, 64)).toContain("OFFLINE PREVIEW");
    expect(mockEditSvg("x", 64, 64, pngDataUrl(), 0.5)).toContain("OFFLINE PREVIEW EDIT");
  });

  it("respects cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.generate({ prompt: "x", width: 8, height: 8, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("OpenAI engine", () => {
  it("snaps requested shapes to the sizes the API supports", () => {
    expect(openAiSizeFor(1024, 1024)).toBe("1024x1024");
    expect(openAiSizeFor(1280, 720)).toBe("1536x1024");
    expect(openAiSizeFor(720, 1280)).toBe("1024x1536");
  });

  it("returns the image the SDK gives back", async () => {
    const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: PNG_BASE64 }] });
    const provider = createOpenAiImageProvider({
      apiKey: "test",
      client: { images: { generate } } as never,
    });
    const picture = await provider.generate({ prompt: "a cat", width: 1024, height: 1024, signal: signal() });
    expect(picture.mime).toBe("image/png");
    expect(picture.width).toBe(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "a cat", size: "1024x1024" }),
      expect.anything(),
    );
  });

  it("explains a missing key", async () => {
    const provider = createOpenAiImageProvider({ apiKey: "" });
    await expect(
      provider.generate({ prompt: "a cat", width: 256, height: 256, signal: signal() }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("NVIDIA engine", () => {
  it("snaps sizes to multiples of 64 within SDXL's range", () => {
    expect(snapNvidiaSize(1000)).toBe(1024);
    expect(snapNvidiaSize(100)).toBe(512);
    expect(snapNvidiaSize(2000)).toBe(1344);
    expect(snapNvidiaSize(930)).toBe(960);
  });

  it("posts the prompt and decodes the artifact", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ artifacts: [{ base64: PNG_BASE64, finishReason: "SUCCESS" }] }));
    const provider = createNvidiaImageProvider({
      apiKey: "nvapi-test",
      model: "stabilityai/stable-diffusion-xl",
      baseUrl: "https://example.test/v1/genai",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const picture = await provider.generate({ prompt: "a lake", width: 1024, height: 640, signal: signal() });
    expect(picture.mime).toBe("image/png");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/v1/genai/stabilityai/stable-diffusion-xl");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer nvapi-test" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.text_prompts[0].text).toBe("a lake");
    expect(body.width).toBe(1024);
    expect(body.height).toBe(640);
  });

  it("reports upstream failures without leaking the key", async () => {
    const provider = createNvidiaImageProvider({
      apiKey: "nvapi-secret",
      fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 402 })) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", width: 512, height: 512, signal: signal() }),
    ).rejects.toMatchObject({ code: "upstream", status: 402 });
    await expect(
      provider.generate({ prompt: "x", width: 512, height: 512, signal: signal() }),
    ).rejects.not.toThrow(/nvapi-secret/);
  });
});

describe("Pollinations engine", () => {
  it("requests an image for the prompt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(pngBytes(), { headers: { "content-type": "image/png" } }));
    const provider = createPollinationsImageProvider({
      baseUrl: "https://images.test/prompt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const picture = await provider.generate({
      prompt: "a fox in snow",
      width: 768,
      height: 512,
      signal: signal(),
    });
    expect(picture.mime).toBe("image/png");
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("https://images.test/prompt/a%20fox%20in%20snow");
    expect(url).toContain("width=768");
  });

  it("needs a public address to edit", async () => {
    const provider = createPollinationsImageProvider({ fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(
      provider.edit!({
        prompt: "stormy",
        width: 512,
        height: 512,
        image: { bytes: pngBytes(), mime: "image/png", dataUrl: pngDataUrl() },
        strength: 0.5,
        signal: signal(),
      }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("refuses answers that aren't pictures", async () => {
    const provider = createPollinationsImageProvider({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":"no"}', { headers: { "content-type": "application/json" } }),
        ) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", width: 512, height: 512, signal: signal() }),
    ).rejects.toMatchObject({ code: "bad_response" });
  });
});

describe("fallback chain", () => {
  const failing = (id: string): ImageProvider => ({
    id,
    label: id,
    supportsEdit: false,
    generate: vi.fn().mockRejectedValue(new ImageProviderError("down", "unavailable")),
  });

  const working: ImageProvider = {
    id: "mock",
    label: "Offline preview",
    supportsEdit: true,
    generate: vi.fn().mockResolvedValue({ bytes: pngBytes(), mime: "image/png", width: 2, height: 2 }),
    edit: vi.fn().mockResolvedValue({ bytes: pngBytes(), mime: "image/png", width: 2, height: 2 }),
  };

  it("moves on when an engine fails", async () => {
    const chain = createFallbackImageProvider([failing("openai"), working]);
    const picture = await chain.generate({ prompt: "x", width: 2, height: 2, signal: signal() });
    expect(picture.mime).toBe("image/png");
    expect(chain.supportsEdit).toBe(true);
  });

  it("reports the last failure when everything is down", async () => {
    const chain = createFallbackImageProvider([failing("a"), failing("b")]);
    await expect(
      chain.generate({ prompt: "x", width: 2, height: 2, signal: signal() }),
    ).rejects.toBeInstanceOf(ImageProviderError);
  });

  it("never retries after the person presses stop", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted: ImageProvider = {
      id: "a",
      label: "a",
      supportsEdit: false,
      generate: vi.fn().mockRejectedValue(new ImageProviderError("stopped", "aborted")),
    };
    const chain = createFallbackImageProvider([aborted, working]);
    await expect(
      chain.generate({ prompt: "x", width: 2, height: 2, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(working.generate).not.toHaveBeenCalled();
  });

  it("skips engines that can't edit", async () => {
    const chain = createFallbackImageProvider([failing("openai"), working]);
    const picture = await chain.edit!({
      prompt: "x",
      width: 2,
      height: 2,
      image: { bytes: pngBytes(), mime: "image/png", dataUrl: pngDataUrl() },
      strength: 0.5,
      signal: signal(),
    });
    expect(picture.width).toBe(2);
  });

  it("says so when nothing can edit", async () => {
    const chain = createFallbackImageProvider([failing("openai")]);
    await expect(
      chain.edit!({
        prompt: "x",
        width: 2,
        height: 2,
        image: { bytes: pngBytes(), mime: "image/png", dataUrl: pngDataUrl() },
        strength: 0.5,
        signal: signal(),
      }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
});
