import "server-only";
import { z } from "zod";
import { AiProviderError, type AiProvider, type AiRequest } from "../types";

/**
 * PROXIMA Core API (by Sujan Shrestha), hosted on Render.
 *   POST {AI_API_URL}   body: { message, session_id }   →   { reply }
 *
 * Called ONLY from the server — the browser never sees this URL.
 * Render's free plan sleeps when idle; the first request can take ~30–60s.
 * The chat route shows a "waking up" message during that time.
 */
export const DEFAULT_SUJAN_CORE_URL = "https://sujancoreapi.onrender.com/chat";

const replySchema = z.object({ reply: z.string() });
const RETRYABLE_STATUS = new Set([502, 503, 504]);

type Options = {
  url?: string;
  fetchImpl?: typeof fetch;
  /** Wait before the single retry on 502/503/504 (Render restarting). */
  retryDelayMs?: number;
};

export function createSujanCoreProvider(options: Options = {}): AiProvider {
  const url = options.url ?? (process.env.AI_API_URL || DEFAULT_SUJAN_CORE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 1500;

  async function callOnce({ message, sessionId, signal }: AiRequest): Promise<Response> {
    try {
      return await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message, session_id: sessionId }),
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (signal.aborted) throw abortError(signal);
      throw new AiProviderError(`Network error calling AI API: ${(error as Error).message}`, "unavailable");
    }
  }

  return {
    id: "sujan-core",
    label: "PROXIMA Core API",

    async complete(request) {
      let response = await callOnce(request);
      if (RETRYABLE_STATUS.has(response.status) && !request.signal.aborted) {
        await sleep(retryDelayMs, request.signal);
        response = await callOnce(request);
      }
      if (!response.ok) {
        throw new AiProviderError(
          `AI API responded with HTTP ${response.status}`,
          "upstream",
          response.status,
        );
      }

      const parsed = replySchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new AiProviderError("AI API returned an unexpected format", "bad_response");
      const reply = parsed.data.reply.trim();
      if (!reply) throw new AiProviderError("AI API returned an empty reply", "bad_response");
      return reply;
    },

    async ping(signal) {
      // Any HTTP answer (even 404/405) means the server is awake.
      const started = Date.now();
      try {
        await fetchImpl(new URL(url).origin, { method: "GET", signal, cache: "no-store" });
      } catch (error) {
        if (signal.aborted) throw abortError(signal);
        throw new AiProviderError(`AI API unreachable: ${(error as Error).message}`, "unavailable");
      }
      return Date.now() - started;
    },
  };
}

function abortError(signal: AbortSignal): AiProviderError {
  const reason = signal.reason as { name?: string } | undefined;
  return reason?.name === "TimeoutError"
    ? new AiProviderError("AI API timed out", "timeout")
    : new AiProviderError("Request was cancelled", "aborted");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}
