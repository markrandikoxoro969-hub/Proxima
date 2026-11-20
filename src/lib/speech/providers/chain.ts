import "server-only";
import { SpeechProviderError, type SpeechAudio, type SpeechProvider, type SpeechRequest } from "../types";

/**
 * Tries each voice engine in order and returns the first audio that works.
 *
 * A missing key, a provider outage or a rate limit falls through to the next
 * engine. A cancelled request never does: the browser pressed Stop, so no
 * other vendor should be asked to speak.
 */
export function createFallbackSpeechProvider(providers: SpeechProvider[]): SpeechProvider {
  if (providers.length === 0) {
    throw new SpeechProviderError("No natural voice engine is configured", "unavailable");
  }

  return {
    id: providers.map((provider) => provider.id).join(">"),
    label: providers.map((provider) => provider.label).join(" → "),

    async synthesize(request: SpeechRequest): Promise<SpeechAudio> {
      let lastError: SpeechProviderError | null = null;
      for (const provider of providers) {
        try {
          return await provider.synthesize(request);
        } catch (error) {
          if (error instanceof SpeechProviderError && error.code === "aborted") throw error;
          const reason =
            error instanceof SpeechProviderError
              ? error
              : new SpeechProviderError(String(error), "unavailable");
          // Log the engine and failure type only — never the answer text or a key.
          console.warn(`[speech] ${provider.id} could not speak (${reason.code})`);
          lastError = reason;
        }
      }
      throw lastError ?? new SpeechProviderError("No voice engine could speak", "unavailable");
    },
  };
}
