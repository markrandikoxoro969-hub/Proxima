// @vitest-environment node
import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { buildMessages, SYSTEM_PROMPT } from "../prompt";
import { createNvidiaProvider, supportsVision, type VisionRead } from "./nvidia";
import type { AiDelta, AiImage } from "../types";

/** A fake OpenAI client whose stream is the given chunks. */
function setup(
  chunks: unknown[],
  overrides: { enableThinking?: boolean; model?: string; visionModel?: string } = {},
  describeImages?: (client: OpenAI, input: VisionRead) => Promise<string>,
) {
  let body: Record<string, unknown> | undefined;
  const createStream = vi.fn(async (_client: OpenAI, sent: unknown) => {
    body = sent as Record<string, unknown>;
    return (async function* () {
      yield* chunks;
    })();
  });
  const provider = createNvidiaProvider({
    client: {} as OpenAI,
    createStream: createStream as never,
    settings: {
      apiKey: "nvapi-test",
      model: overrides.model ?? "nvidia/test-model",
      visionModel: overrides.visionModel ?? "",
      maxTokens: 2048,
      enableThinking: overrides.enableThinking ?? true,
      firstTokenTimeoutMs: 1000,
    },
    describeImages,
  });
  return { provider, createStream, body: () => body };
}

const chunk = (delta: { content?: string; reasoning_content?: string }, finishReason?: string) => ({
  choices: [{ delta, finish_reason: finishReason ?? null }],
});

const collect = async (iterable: AsyncIterable<AiDelta>) => {
  const out: AiDelta[] = [];
  for await (const d of iterable) out.push(d);
  return out;
};

const request = {
  message: "Explain a Map in one sentence",
  sessionId: "s1",
  signal: new AbortController().signal,
  history: [
    { role: "user" as const, content: "first question" },
    { role: "assistant" as const, content: "first answer" },
  ],
};

describe("supportsVision", () => {
  it("recognises Omni, vision and VL models, and leaves text models alone", () => {
    expect(supportsVision("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", {})).toBe(true);
    expect(supportsVision("meta/llama-3.2-90b-vision-instruct", {})).toBe(true);
    expect(supportsVision("nvidia/nemotron-3-ultra-550b-a55b", {})).toBe(false);
  });

  it("lets NVIDIA_VISION override the name", () => {
    expect(supportsVision("nvidia/nemotron-3-ultra-550b-a55b", { NVIDIA_VISION: "true" })).toBe(true);
    expect(supportsVision("meta/llama-3.2-90b-vision-instruct", { NVIDIA_VISION: "off" })).toBe(false);
  });
});

describe("NVIDIA provider", () => {
  it("sends the system prompt, history and the newest message", async () => {
    const { provider, body } = setup([chunk({ content: "ok" })]);
    await collect(provider.stream!(request));

    const sent = body()!;
    expect(sent.model).toBe("nvidia/test-model");
    expect(sent.stream).toBe(true);
    // Default mode ("thinking") uses its own tuning, capped by the env value.
    expect(sent.temperature).toBe(0.7);
    expect(sent.top_p).toBe(0.95);
    expect(sent.max_tokens).toBe(2048);
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: true });

    const messages = sent.messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(messages.slice(1)).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "Explain a Map in one sentence" },
    ]);
  });

  it("keeps reasoning_content separate from the answer", async () => {
    const { provider } = setup([
      chunk({ reasoning_content: "The user wants a one-liner." }),
      chunk({ content: "A Map stores key → value pairs." }),
    ]);
    const deltas = await collect(provider.stream!(request));
    expect(deltas).toEqual([
      { type: "reasoning", text: "The user wants a one-liner." },
      { type: "text", text: "A Map stores key → value pairs." },
    ]);
  });

  it("can switch thinking off", async () => {
    const { provider, body } = setup([chunk({ content: "ok" })], { enableThinking: false });
    await collect(provider.stream!(request));
    expect(body()!.chat_template_kwargs).toBeUndefined();
  });

  it("fast mode turns private thinking off and shortens the answer", async () => {
    const { provider, body } = setup([chunk({ content: "ok" })]);
    await collect(provider.stream!({ ...request, mode: "fast" }));
    const sent = body()!;
    expect(sent.chat_template_kwargs).toBeUndefined();
    expect(sent.temperature).toBe(0.4);
    expect(sent.max_tokens).toBe(1024);
    // 12 turns of context instead of 20.
    expect((sent.messages as unknown[]).length).toBeLessThanOrEqual(1 + 12 + 1);
  });

  it("coding and analyze modes keep thinking on and get the full token budget", async () => {
    for (const mode of ["coding", "analyze"] as const) {
      const { provider, body } = setup([chunk({ content: "ok" })]);
      await collect(provider.stream!({ ...request, mode }));
      const sent = body()!;
      expect(sent.chat_template_kwargs).toEqual({ enable_thinking: true });
      // Never above NVIDIA_MAX_TOKENS (2048 in these tests).
      expect(sent.max_tokens).toBe(2048);
    }
  });

  it("continues a coding answer that hit the length limit, without repeating it", async () => {
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    const createStream = vi.fn(async (_client: OpenAI, sent: unknown) => {
      bodies.push(sent as Record<string, unknown>);
      call += 1;
      const first = call === 1;
      return (async function* () {
        yield first
          ? chunk({ content: "```ts\nexport function f() {" }, "length")
          : chunk({ content: "\n}\n```" }, "stop");
      })();
    });
    const provider = createNvidiaProvider({
      client: {} as OpenAI,
      createStream: createStream as never,
      settings: {
        apiKey: "nvapi-test",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        visionModel: "",
        maxTokens: 2048,
        enableThinking: true,
        firstTokenTimeoutMs: 1000,
      },
    });

    const deltas = await collect(provider.stream!({ ...request, mode: "coding" }));

    expect(deltas.map((delta) => delta.text).join("")).toBe("```ts\nexport function f() {\n}\n```");
    expect(bodies).toHaveLength(2);
    // The follow-up does not think again; its whole budget goes to the rest.
    expect(bodies[1].chat_template_kwargs).toBeUndefined();
    const messages = bodies[1].messages as { role: string; content: string }[];
    expect(messages.at(-2)).toEqual({ role: "assistant", content: "```ts\nexport function f() {" });
    expect(messages.at(-1)?.content).toContain("Continue from the exact character");
  });

  it("keeps the partial answer when a continuation fails", async () => {
    let call = 0;
    const createStream = vi.fn(async () => {
      call += 1;
      if (call === 2) throw new Error("network went away");
      return (async function* () {
        yield chunk({ content: "half of a file" }, "length");
      })();
    });
    const provider = createNvidiaProvider({
      client: {} as OpenAI,
      createStream: createStream as never,
      settings: {
        apiKey: "nvapi-test",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        visionModel: "",
        maxTokens: 2048,
        enableThinking: true,
        firstTokenTimeoutMs: 1000,
      },
    });

    const deltas = await collect(provider.stream!({ ...request, mode: "coding" }));

    expect(deltas.map((delta) => delta.text).join("")).toBe("half of a file");
    expect(createStream).toHaveBeenCalledTimes(2);
  });

  it("ignores an unknown mode instead of failing", async () => {
    const { provider, body } = setup([chunk({ content: "ok" })]);
    await collect(provider.stream!({ ...request, mode: "nonsense" as never }));
    expect(body()!.temperature).toBe(0.7);
  });

  it("ignores empty or malformed chunks", async () => {
    const { provider } = setup([{}, null, { choices: [] }, chunk({ content: "hi" })]);
    expect(await collect(provider.stream!(request))).toEqual([{ type: "text", text: "hi" }]);
  });

  it("lets a text-only model see pictures through a vision reader", async () => {
    const images: AiImage[] = [
      { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 800, height: 600 },
    ];
    const describeImages = vi.fn(async (client: OpenAI, input: VisionRead) => {
      expect(client).toBeDefined();
      expect(input.images).toHaveLength(1);
      return 'A login form with the error "Invalid password".';
    });
    const { provider, body } = setup(
      [chunk({ content: "The form says invalid password." })],
      {
        visionModel: "meta/vision-test",
      },
      describeImages,
    );

    const deltas = await collect(provider.stream!({ ...request, images }));

    expect(describeImages).toHaveBeenCalledOnce();
    expect(describeImages.mock.calls[0]?.[1]).toMatchObject({
      model: "meta/vision-test",
      question: request.message,
    });
    const sent = body()!;
    // The answer still comes from the main model, with the picture description in the prompt.
    expect(sent.model).toBe("nvidia/test-model");
    const messages = sent.messages as { role: string; content: unknown }[];
    const newest = messages.at(-1)!;
    expect(typeof newest.content).toBe("string");
    expect(newest.content).toContain("Invalid password");
    expect(newest.content).not.toContain("can't see images");
    expect(deltas).toEqual([{ type: "text", text: "The form says invalid password." }]);
  });

  it("keeps the honest picture note when the vision reader is unavailable", async () => {
    const images: AiImage[] = [
      { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 800, height: 600 },
    ];
    const describeImages = vi.fn(async () => {
      throw new Error("vision model is offline");
    });
    const { provider, body } = setup(
      [chunk({ content: "ok" })],
      {
        visionModel: "meta/vision-test",
      },
      describeImages,
    );

    const deltas = await collect(provider.stream!({ ...request, images }));

    const newest = (body()!.messages as { content: string }[]).at(-1)!;
    expect(newest.content).toContain("attached a picture");
    expect(newest.content).toContain("can't see images");
    expect(deltas).toEqual([{ type: "text", text: "ok" }]);
  });

  it("sends image parts directly to a vision model and skips the thinking flag", async () => {
    const images: AiImage[] = [
      { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 800, height: 600 },
    ];
    const describeImages = vi.fn();
    const { provider, body } = setup(
      [chunk({ content: "I see it." })],
      {
        model: "meta/llama-3.2-90b-vision-instruct",
      },
      describeImages,
    );

    await collect(provider.stream!({ ...request, images }));

    expect(describeImages).not.toHaveBeenCalled();
    const sent = body()!;
    expect(sent.chat_template_kwargs).toBeUndefined();
    const newest = (sent.messages as { content: unknown }[]).at(-1)!;
    expect(Array.isArray(newest.content)).toBe(true);
    expect((newest.content as { type: string }[]).some((part) => part.type === "image_url")).toBe(true);
  });

  it("lets an Omni main model reason while seeing the picture", async () => {
    const images: AiImage[] = [
      { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 800, height: 600 },
    ];
    const describeImages = vi.fn();
    const { provider, body } = setup(
      [chunk({ content: "I see the error." })],
      { model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" },
      describeImages,
    );

    await collect(provider.stream!({ ...request, images }));

    expect(describeImages).not.toHaveBeenCalled();
    const sent = body()!;
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: true });
    const newest = (sent.messages as { content: unknown }[]).at(-1)!;
    expect(Array.isArray(newest.content)).toBe(true);
    expect((newest.content as { type: string }[]).some((part) => part.type === "image_url")).toBe(true);
  });

  it("sends the picture to the vision client, not the normal one", async () => {
    const images: AiImage[] = [
      { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 800, height: 600 },
    ];
    const normalCreate = vi.fn(async () => {
      throw new Error("the normal client must not read pictures");
    });
    const visionCreate = vi.fn(async () => ({
      choices: [{ message: { content: "A terminal showing a failed test." } }],
    }));
    const normalClient = { chat: { completions: { create: normalCreate } } } as unknown as OpenAI;
    const visionClient = { chat: { completions: { create: visionCreate } } } as unknown as OpenAI;
    const createStream = vi.fn(async () => {
      return (async function* () {
        yield chunk({ content: "The test failed." });
      })();
    });
    const provider = createNvidiaProvider({
      client: normalClient,
      visionClient,
      createStream: createStream as never,
      settings: {
        apiKey: "nvapi-normal",
        visionApiKey: "nvapi-vision",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        visionModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        maxTokens: 2048,
        enableThinking: true,
        firstTokenTimeoutMs: 1000,
      },
    });

    await collect(provider.stream!({ ...request, images }));

    expect(visionCreate).toHaveBeenCalledOnce();
    expect(normalCreate).not.toHaveBeenCalled();
  });

  it("asks the Omni reader for observations with thinking off", async () => {
    const images: AiImage[] = [
      { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 800, height: 600 },
    ];
    const create = vi.fn(async () => ({
      choices: [{ message: { content: 'A login form with the error "Invalid password".' } }],
    }));
    const fakeClient = { chat: { completions: { create } } } as unknown as OpenAI;
    const createStream = vi.fn(async () => {
      return (async function* () {
        yield chunk({ content: "The form says invalid password." });
      })();
    });
    const provider = createNvidiaProvider({
      client: fakeClient,
      createStream: createStream as never,
      settings: {
        apiKey: "nvapi-test",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        visionModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        maxTokens: 2048,
        enableThinking: true,
        firstTokenTimeoutMs: 1000,
      },
    });

    await collect(provider.stream!({ ...request, images }));

    expect(create).toHaveBeenCalledOnce();
    const [sent, visionOptions] = create.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { signal: AbortSignal },
    ];
    expect(sent.model).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    expect(sent.max_tokens).toBe(2048);
    expect(sent.stream).toBe(false);
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(visionOptions.signal.aborted).toBe(false);
  });

  it("fails clearly when no key is configured", async () => {
    const provider = createNvidiaProvider({
      settings: { apiKey: "" },
      createStream: async () => {
        throw new Error("should not be called");
      },
    });
    await expect(collect(provider.stream!(request))).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("buildMessages", () => {
  it("keeps only the last 20 turns", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
      content: `m${i}`,
    }));
    const messages = buildMessages({ message: "new", history });
    expect(messages).toHaveLength(1 + 20 + 1);
    expect(messages[1].content).toBe("m10");
    expect(messages.at(-1)).toEqual({ role: "user", content: "new" });
  });

  it("drops empty history entries", () => {
    const messages = buildMessages({
      message: "new",
      history: [
        { role: "user", content: "  " },
        { role: "assistant", content: "kept" },
      ],
    });
    expect(messages.map((m) => m.content)).toEqual([SYSTEM_PROMPT, "kept", "new"]);
  });
});
