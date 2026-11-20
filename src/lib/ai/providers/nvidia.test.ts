// @vitest-environment node
import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { buildMessages, SYSTEM_PROMPT } from "../prompt";
import { createNvidiaProvider } from "./nvidia";
import type { AiDelta } from "../types";

/** A fake OpenAI client whose stream is the given chunks. */
function setup(chunks: unknown[], overrides: { enableThinking?: boolean } = {}) {
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
      model: "nvidia/test-model",
      maxTokens: 2048,
      enableThinking: overrides.enableThinking ?? true,
      firstTokenTimeoutMs: 1000,
    },
  });
  return { provider, createStream, body: () => body };
}

const chunk = (delta: { content?: string; reasoning_content?: string }) => ({
  choices: [{ delta }],
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

  it("ignores an unknown mode instead of failing", async () => {
    const { provider, body } = setup([chunk({ content: "ok" })]);
    await collect(provider.stream!({ ...request, mode: "nonsense" as never }));
    expect(body()!.temperature).toBe(0.7);
  });

  it("ignores empty or malformed chunks", async () => {
    const { provider } = setup([{}, null, { choices: [] }, chunk({ content: "hi" })]);
    expect(await collect(provider.stream!(request))).toEqual([{ type: "text", text: "hi" }]);
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
