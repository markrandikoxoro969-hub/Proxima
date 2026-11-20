import "server-only";
import { generateReply } from "../reply";
import { AiProviderError, type AiDelta, type AiProvider, type AiRequest } from "../types";

/**
 * Two providers, one answer.
 *
 * The primary is tried first. If it fails BEFORE it has shown any text, the
 * fallback answers instead — the user sees one short delay, never an error.
 * If it fails mid-answer we stop: mixing two models would produce a reply that
 * contradicts itself.
 *
 * The primary also gets its own short deadline (first-token timeout), so a
 * silent NVIDIA request can't eat the whole request budget.
 */
export function createFallbackProvider({
  primary,
  fallback,
  primaryTimeoutMs = 45_000,
  onFallback,
}: {
  primary: AiProvider;
  fallback: AiProvider;
  primaryTimeoutMs?: number;
  /** Called once when we switch, for logs (never with user content). */
  onFallback?: (reason: string) => void;
}): AiProvider {
  return {
    id: `${primary.id}+${fallback.id}`,
    label: `${primary.label} → ${fallback.label}`,

    async *stream(request: AiRequest): AsyncGenerator<AiDelta> {
      let emitted = false;

      // Per-attempt deadline. It only aborts this attempt, not the whole request.
      const attemptSignal = AbortSignal.any([request.signal, AbortSignal.timeout(primaryTimeoutMs)]);

      try {
        for await (const delta of generateReply(primary, { ...request, signal: attemptSignal })) {
          // Reasoning alone is not an answer: we can still fall back safely.
          if (delta.type === "text") emitted = true;
          yield delta;
        }
        return;
      } catch (error) {
        if (request.signal.aborted) throw error;
        if (emitted) throw error;
        const code = error instanceof AiProviderError ? error.code : "unavailable";
        onFallback?.(`${primary.id} failed (${code})`);
        console.warn(`[ai] ${primary.id} failed (${code}); switching to ${fallback.id}`);
      }

      // Fresh budget for the fallback: only the outer request signal applies.
      yield* generateReply(fallback, request);
    },

    async ping(signal) {
      // Report the primary's health; the fallback is checked only if it fails.
      if (primary.ping) {
        try {
          return await primary.ping(signal);
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }
      return fallback.ping ? fallback.ping(signal) : 0;
    },
  };
}
