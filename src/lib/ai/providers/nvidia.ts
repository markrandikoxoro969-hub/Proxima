import "server-only";
import OpenAI from "openai";
import { modeModelSettings, resolveChatMode } from "../modes";
import { buildMessages, SYSTEM_PROMPT } from "../prompt";
import { resolveNvidiaSettings, type NvidiaSettings } from "../settings";
import { AiProviderError, type AiDelta, type AiProvider, type AiRequest } from "../types";

/**
 * NVIDIA NIM provider (OpenAI-compatible API).
 *
 *   POST https://integrate.api.nvidia.com/v1/chat/completions
 *
 * The key is read from NVIDIA_API_KEY on the server. It is never logged, never
 * put in an error message and never sent to the browser.
 *
 * Two streams come back from the model:
 *   delta.reasoning_content → the model thinking out loud (we hide it)
 *   delta.content           → the actual answer (we stream it)
 *
 * Both are yielded as typed deltas; the route decides what to show.
 */

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Extra body field NVIDIA uses to switch "thinking" on for Nemotron. */
type ChatTemplateKwargs = { chat_template_kwargs?: { enable_thinking?: boolean } };

export type NvidiaOptions = {
  /** Pass a pre-configured client (tests) or a partial settings override. */
  client?: OpenAI;
  settings?: Partial<NvidiaSettings>;
  /** Injected in tests so no network call is made. */
  createStream?: (client: OpenAI, body: unknown, signal: AbortSignal) => Promise<AsyncIterable<unknown>>;
};

export function nvidiaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.NVIDIA_API_KEY ?? "").trim());
}

/**
 * Can this model see pictures?
 *
 * NVIDIA_VISION=true / false overrides the guess. Otherwise the model name is
 * checked, so switching NVIDIA_MODEL to a vision model turns attachments on
 * without any other change. The default Nemotron model is text-only, so the
 * chat tells people to describe the picture instead of silently ignoring it.
 */
export function supportsVision(
  model: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = (env.NVIDIA_VISION ?? "").trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "on") return true;
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return /(vision|llava|pixtral|vila|qwen[-_ ]?\d*\.?\d*-?vl|vl[-_]?\d|nemotron.*vl|gemma-3)/i.test(model);
}

export function createNvidiaProvider(options: NvidiaOptions = {}): AiProvider {
  const settings = { ...resolveNvidiaSettings(), ...options.settings };

  // Created on first use, so a missing key fails with our own clear error
  // instead of a crash while the module loads.
  let client = options.client;
  const getClient = () => {
    client ??= new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL,
      // We control timeouts ourselves (AbortSignal) so the fallback can start fast.
      timeout: 90_000,
      maxRetries: 0,
    });
    return client;
  };

  const createStream =
    options.createStream ??
    ((c: OpenAI, body: unknown, signal: AbortSignal) =>
      c.chat.completions.create(body as never, { signal }) as unknown as Promise<AsyncIterable<unknown>>);

  async function* stream(request: AiRequest): AsyncGenerator<AiDelta> {
    if (!settings.apiKey && !options.client) {
      throw new AiProviderError("NVIDIA_API_KEY is not set", "unavailable");
    }

    // The composer's mode decides how much room and reasoning the model gets.
    // NVIDIA_MAX_TOKENS stays the hard ceiling, so a small env value still wins.
    const mode = resolveChatMode(request.mode);
    const tuning = modeModelSettings(mode, settings.maxTokens);
    const useThinking = settings.enableThinking && tuning.thinking;

    const body = {
      model: settings.model,
      messages: buildMessages({
        message: request.message,
        history: request.history,
        system: request.system ?? SYSTEM_PROMPT,
        images: request.images,
        attachImages: supportsVision(settings.model),
        historyLimit: tuning.historyLimit,
      }),
      temperature: tuning.temperature,
      top_p: tuning.topP,
      max_tokens: tuning.maxTokens,
      stream: true,
      // NVIDIA-specific: let the model reason privately first. Behind a flag so
      // it can be switched off without a code change.
      ...(useThinking
        ? ({ chat_template_kwargs: { enable_thinking: true } } satisfies ChatTemplateKwargs)
        : {}),
    };

    let iterable: AsyncIterable<unknown>;
    try {
      iterable = await createStream(getClient(), body, request.signal);
    } catch (error) {
      throw toProviderError(error, request.signal);
    }

    try {
      for await (const raw of iterable) {
        if (request.signal.aborted) return;
        const delta = readDelta(raw);
        if (!delta) continue;
        if (delta.reasoning_content) {
          yield { type: "reasoning", text: delta.reasoning_content };
        }
        if (delta.content) {
          yield { type: "text", text: delta.content };
        }
      }
    } catch (error) {
      if (request.signal.aborted) {
        const reason = request.signal.reason as { name?: string } | undefined;
        if (reason?.name === "TimeoutError") {
          throw new AiProviderError("NVIDIA request timed out", "timeout");
        }
        throw new AiProviderError("Request was cancelled", "aborted");
      }
      throw toProviderError(error, request.signal);
    }
  }

  return {
    id: "nvidia",
    label: `NVIDIA (${settings.model})`, // modes are applied per request, not per provider
    stream,

    async ping(signal) {
      const started = Date.now();
      try {
        await fetch(settings.baseURL, { method: "GET", signal, cache: "no-store" });
      } catch (error) {
        if (signal.aborted) throw new AiProviderError("NVIDIA ping cancelled", "aborted");
        throw new AiProviderError(`NVIDIA unreachable: ${(error as Error).message}`, "unavailable");
      }
      return Date.now() - started;
    },
  };
}

type StreamDelta = { content?: string | null; reasoning_content?: string | null };

/** Pulls {content, reasoning_content} out of one stream chunk, defensively. */
function readDelta(raw: unknown): StreamDelta | null {
  if (!raw || typeof raw !== "object") return null;
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const delta = (choices[0] as { delta?: unknown })?.delta;
  if (!delta || typeof delta !== "object") return null;
  const d = delta as StreamDelta;
  if (!d.content && !d.reasoning_content) return null;
  return d;
}

/** Turns SDK/network failures into the small set of codes the UI understands. */
function toProviderError(error: unknown, signal: AbortSignal): AiProviderError {
  if (signal.aborted) {
    const reason = signal.reason as { name?: string } | undefined;
    return reason?.name === "TimeoutError"
      ? new AiProviderError("NVIDIA request timed out", "timeout")
      : new AiProviderError("Request was cancelled", "aborted");
  }
  const status = (error as { status?: number })?.status;
  if (typeof status === "number") {
    return new AiProviderError(`NVIDIA responded with HTTP ${status}`, "upstream", status);
  }
  const name = (error as { name?: string })?.name;
  if (name === "APIConnectionTimeoutError") {
    return new AiProviderError("NVIDIA request timed out", "timeout");
  }
  return new AiProviderError(
    `NVIDIA request failed: ${(error as Error)?.message ?? "unknown error"}`,
    "unavailable",
  );
}
