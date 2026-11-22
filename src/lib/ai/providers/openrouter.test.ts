// @vitest-environment node
import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiProvider, resetAiProviderCache } from "../index";
import { generateCodingFile, planCodingTask } from "../coding-task";
import type { AiDelta } from "../types";
import { createOpenRouterProvider, openRouterKey } from "./openrouter";

const request = {
  message: "Write code",
  sessionId: "test",
  mode: "coding" as const,
  signal: new AbortController().signal,
};
const collect = async (iterable: AsyncIterable<AiDelta>) => {
  const result: AiDelta[] = [];
  for await (const item of iterable) result.push(item);
  return result;
};
const chunk = (delta: unknown, finish_reason: string | null = "stop") => ({
  choices: [{ delta, finish_reason }],
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetAiProviderCache();
});

describe("OpenRouter coding provider", () => {
  it("cleans copied keys without exposing them", () => {
    expect(openRouterKey({ OPENROUTER_API_KEY: `OPENROUTER_API_KEY="sk-or-test\\_key"` })).toBe(
      "sk-or-test_key",
    );
  });

  it("streams the free model with a 65536 token limit and reasoning disabled", async () => {
    const bodies: Record<string, unknown>[] = [];
    const createStream = vi.fn(async (_client: OpenAI, body: unknown) => {
      bodies.push(body as Record<string, unknown>);
      return (async function* () {
        yield chunk({ reasoning: "private" }, null);
        yield chunk({ content: "Hello" }, null);
        yield chunk({}, "stop");
        yield { choices: [], usage: { completion_tokens: 10 } };
      })();
    });
    const provider = createOpenRouterProvider({ client: {} as OpenAI, createStream });
    expect(await collect(provider.stream!(request))).toEqual([
      { type: "reasoning", text: "private" },
      { type: "text", text: "Hello" },
    ]);
    expect(provider.id).toBe("openrouter");
    expect(bodies[0]).toMatchObject({
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      max_tokens: 65_536,
      stream: true,
      reasoning: { enabled: false },
    });
    expect(bodies[0]).not.toHaveProperty("chat_template_kwargs");
  });

  it("continues a truncated response without repeating its suffix", async () => {
    let calls = 0;
    const createStream = vi.fn(async () =>
      (async function* () {
        calls++;
        yield calls === 1
          ? chunk({ content: "```ts\nexport const value =" }, "length")
          : chunk({ content: " 1;\n```" });
      })(),
    );
    const provider = createOpenRouterProvider({ client: {} as OpenAI, createStream });
    const result = await collect(provider.stream!(request));
    expect(result.map((d) => d.text).join("")).toBe("```ts\nexport const value = 1;\n```");
    expect(createStream).toHaveBeenCalledTimes(2);
  });

  it("reports streamed errors and empty responses instead of treating them as success", async () => {
    const createStream = vi.fn(async () =>
      (async function* () {
        yield { error: { code: 403, message: "private" } };
      })(),
    );
    const provider = createOpenRouterProvider({ client: {} as OpenAI, createStream });
    await expect(collect(provider.stream!(request))).rejects.toMatchObject({ code: "upstream", status: 403 });
    const empty = createOpenRouterProvider({
      client: {} as OpenAI,
      createStream: async () =>
        (async function* () {
          yield chunk({});
        })(),
    });
    await expect(collect(empty.stream!(request))).rejects.toMatchObject({ code: "bad_response" });
  });

  it("sends actual OpenAI-compatible HTTP requests to OpenRouter", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("NVIDIA_API_KEY", "");
    const fetch = vi.fn(
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const provider = createOpenRouterProvider();
    expect((await collect(provider.stream!(request))).map((d) => d.text).join("")).toBe("OK");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-or-test");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      max_tokens: 65_536,
    });
  });

  it("uses OpenRouter and the full limit for both project planning and file generation", async () => {
    vi.stubEnv("AI_PROVIDER", "render");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        const messages = body.messages as { role: string; content: string }[];
        const system = messages[0].content;
        const marker = system.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
        const text = marker
          ? `export const value = 1;\n${marker}`
          : JSON.stringify({ files: [{ path: "src/value.ts", purpose: "Export a value." }] });
        const line = JSON.stringify(chunk({ content: text }, "stop"));
        return new Response(`data: ${line}\n\ndata: [DONE]\n\n`, {
          headers: { "content-type": "text/event-stream" },
        });
      }),
    );
    const provider = getAiProvider("coding");
    const files = await planCodingTask(provider, request);
    const output = await generateCodingFile(provider, request, {
      file: files[0],
      files,
      completedFiles: [],
      completedContent: "",
    });
    expect(output).toBe("export const value = 1;");
    expect(bodies).toHaveLength(2);
    for (const body of bodies)
      expect(body).toMatchObject({ model: "nvidia/nemotron-3-ultra-550b-a55b:free", max_tokens: 65_536 });
  });

  it("uses the normal provider when OpenRouter refuses a request before streaming", async () => {
    vi.stubEnv("AI_PROVIDER", "render");
    vi.stubEnv("AI_API_URL", "https://fallback.example/chat");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("AI_STREAM_PACE_TOTAL_MS", "0");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("openrouter.ai")
        ? Response.json({ error: { message: "bad key" } }, { status: 401 })
        : Response.json({ reply: "Fallback reply" }),
    );
    vi.stubGlobal("fetch", fetch);
    const deltas = await collect(getAiProvider("coding").stream!(request));
    expect(deltas.map((d) => d.text).join("")).toBe("Fallback reply");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the picture-unavailable note when no NVIDIA vision key is configured", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    vi.stubEnv("NVIDIA_VISION_API_KEY", "");
    let body: Record<string, unknown> = {};
    const describeImages = vi.fn();
    const provider = createOpenRouterProvider({
      client: {} as OpenAI,
      describeImages,
      createStream: async (_client, sent) => {
        body = sent as Record<string, unknown>;
        return (async function* () {
          yield chunk({ content: "Please describe the picture." });
        })();
      },
    });
    await collect(
      provider.stream!({
        ...request,
        images: [{ dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 1, height: 1 }],
      }),
    );
    expect(describeImages).not.toHaveBeenCalled();
    expect(JSON.stringify(body.messages)).toContain("can't see images");
  });

  it("routes coding only when configured, preserves mock mode, and falls back when absent", () => {
    vi.stubEnv("AI_PROVIDER", "render");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    expect(getAiProvider("coding").id).toBe("openrouter+render");
    expect(getAiProvider("thinking").id).toBe("render");
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(getAiProvider("coding").id).toBe("mock");
    vi.stubEnv("AI_PROVIDER", "render");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(getAiProvider("coding").id).toBe("render");
  });
});
