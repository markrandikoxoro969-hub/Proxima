import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { speechProviderOrder } from "./index";
import { createFallbackSpeechProvider } from "./providers/chain";
import { createEdgeSpeechProvider, escapeSsml } from "./providers/edge";
import { createOpenAiSpeechProvider } from "./providers/openai";
import { createPollinationsSpeechProvider } from "./providers/pollinations";
import { SpeechProviderError, type SpeechProvider } from "./types";

const signal = () => new AbortController().signal;

describe("Edge provider", () => {
  it("escapes text and maps the girl/boy voices", async () => {
    const synthesize = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const provider = createEdgeSpeechProvider({
      engine: { synthesize },
      env: { SPEECH_EDGE_VOICE_BOY: "en-GB-RyanNeural" },
    });

    const audio = await provider.synthesize({
      text: 'Tea & "cake" <ready>',
      voice: "boy",
      speed: 1.4,
      signal: signal(),
    });

    expect(synthesize).toHaveBeenCalledWith(escapeSsml('Tea & "cake" <ready>'), {
      voiceId: "en-GB-RyanNeural",
      speed: 1.4,
      signal: expect.any(AbortSignal),
    });
    expect(audio).toMatchObject({ mime: "audio/mpeg", provider: "edge" });
    expect(audio.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("can be switched off without breaking the chain", async () => {
    const provider = createEdgeSpeechProvider({
      engine: { synthesize: vi.fn() },
      env: { SPEECH_EDGE: "off" },
    });
    await expect(
      provider.synthesize({ text: "Hello", voice: "girl", speed: 1, signal: signal() }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("escapes the five SSML characters in the safe order", () => {
    expect(escapeSsml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});

describe("OpenAI provider", () => {
  it("asks for the mapped voice, mp3 audio and natural delivery", async () => {
    const create = vi.fn(async (body: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
      void body;
      void options;
      return new Response(new Uint8Array([7, 8]), {
        headers: { "content-type": "audio/mpeg" },
      });
    });
    const provider = createOpenAiSpeechProvider({
      client: { audio: { speech: { create } } } as unknown as OpenAI,
      model: "gpt-4o-mini-tts",
      env: { SPEECH_OPENAI_VOICE_GIRL: "coral" },
    });

    const audio = await provider.synthesize({
      text: "A calm answer.",
      voice: "girl",
      speed: 1,
      signal: signal(),
    });

    const [body, options] = create.mock.calls[0]!;
    expect(body).toMatchObject({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: "A calm answer.",
      response_format: "mp3",
      speed: 1,
    });
    expect(body.instructions).toMatch(/warm, thoughtful friend/i);
    expect(options).toMatchObject({ signal: expect.any(AbortSignal) });
    expect(audio).toMatchObject({ provider: "openai", voiceId: "coral" });
  });

  it("refuses cleanly when no key or client is configured", async () => {
    const provider = createOpenAiSpeechProvider({ env: {} });
    await expect(
      provider.synthesize({ text: "Hello", voice: "boy", speed: 1, signal: signal() }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("Pollinations provider", () => {
  it("posts an OpenAI-compatible speech request with the key", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(new Uint8Array([5]), {
        headers: { "content-type": "audio/mpeg" },
      });
    });
    const provider = createPollinationsSpeechProvider({
      apiKey: "sk_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { SPEECH_POLLINATIONS_VOICE_BOY: "adam" },
    });

    const audio = await provider.synthesize({
      text: "Hello there.",
      voice: "boy",
      speed: 0.9,
      signal: signal(),
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://gen.pollinations.ai/v1/audio/speech");
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer sk_test" }),
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      voice: "adam",
      input: "Hello there.",
      response_format: "mp3",
      speed: 0.9,
    });
    expect(audio).toMatchObject({ provider: "pollinations", voiceId: "adam" });
  });

  it("treats a rejected key as unavailable", async () => {
    const provider = createPollinationsSpeechProvider({
      apiKey: "sk_bad",
      fetchImpl: (async () => new Response("no", { status: 401 })) as typeof fetch,
    });
    await expect(
      provider.synthesize({ text: "Hello", voice: "girl", speed: 1, signal: signal() }),
    ).rejects.toMatchObject({ code: "unavailable", status: 401 });
  });

  it("will not call the service without a key", async () => {
    const provider = createPollinationsSpeechProvider({ env: {} });
    await expect(
      provider.synthesize({ text: "Hello", voice: "girl", speed: 1, signal: signal() }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("fallback chain", () => {
  const provider = (id: string, speak: SpeechProvider["synthesize"]): SpeechProvider => ({
    id,
    label: id,
    synthesize: speak,
  });

  it("uses the next engine when one has no key or is down", async () => {
    const first = vi.fn(async () => {
      throw new SpeechProviderError("no key", "unavailable");
    });
    const second = vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      mime: "audio/mpeg",
      provider: "edge",
      voiceId: "en-US-AvaNeural",
    }));
    const chain = createFallbackSpeechProvider([provider("openai", first), provider("edge", second)]);

    const audio = await chain.synthesize({
      text: "Hello",
      voice: "girl",
      speed: 1,
      signal: signal(),
    });
    expect(audio.provider).toBe("edge");
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("never asks another vendor after Stop", async () => {
    const first = vi.fn(async () => {
      throw new SpeechProviderError("cancelled", "aborted");
    });
    const second = vi.fn();
    const chain = createFallbackSpeechProvider([provider("openai", first), provider("edge", second)]);

    await expect(
      chain.synthesize({ text: "Hello", voice: "girl", speed: 1, signal: signal() }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(second).not.toHaveBeenCalled();
  });

  it("reports the last reason when every engine fails", async () => {
    const chain = createFallbackSpeechProvider([
      provider("openai", async () => {
        throw new SpeechProviderError("down", "unavailable");
      }),
      provider("edge", async () => {
        throw new SpeechProviderError("blocked", "upstream");
      }),
    ]);
    await expect(
      chain.synthesize({ text: "Hello", voice: "girl", speed: 1, signal: signal() }),
    ).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("provider order", () => {
  it("falls back to the free Edge voices with no keys", () => {
    expect(speechProviderOrder({})).toEqual(["edge"]);
  });

  it("prefers paid keys, then Edge", () => {
    expect(speechProviderOrder({ OPENAI_API_KEY: "sk" })).toEqual(["openai", "edge"]);
    expect(speechProviderOrder({ POLLINATIONS_API_KEY: "sk" })).toEqual(["pollinations", "edge"]);
    expect(speechProviderOrder({ OPENAI_API_KEY: "a", POLLINATIONS_API_KEY: "b" })).toEqual([
      "openai",
      "pollinations",
      "edge",
    ]);
  });

  it("honours an explicit provider and the off switch", () => {
    expect(speechProviderOrder({ SPEECH_PROVIDER: "edge" })).toEqual(["edge"]);
    expect(speechProviderOrder({ SPEECH_PROVIDER: "off" })).toEqual([]);
    expect(speechProviderOrder({ SPEECH_PROVIDER: "auto", SPEECH_EDGE: "off" })).toEqual([]);
  });
});
