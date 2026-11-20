import "server-only";
import {
  pollinationsSpeechApiKey,
  pollinationsTtsModel,
  pollinationsTtsUrl,
  speechVoiceId,
} from "../settings";
import { SpeechProviderError, type SpeechAudio, type SpeechProvider, type SpeechRequest } from "../types";

/**
 * Pollinations' OpenAI-compatible speech endpoint, which runs on ElevenLabs
 * voices. It needs a free key from enter.pollinations.ai (the same key the
 * image studio uses) and exposes high-quality voices such as Rachel and Adam
 * through the OpenAI-style names below.
 *
 *   POST https://gen.pollinations.ai/v1/audio/speech
 *   { model: "tts-1", voice: "nova", input: "…", response_format: "mp3" }
 *
 * Without a key the endpoint rejects the request, so this provider is only in
 * the chain when POLLINATIONS_API_KEY is set.
 */
export type PollinationsSpeechOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
};

export function createPollinationsSpeechProvider(options: PollinationsSpeechOptions = {}): SpeechProvider {
  const env = options.env ?? process.env;
  const apiKey = (options.apiKey ?? pollinationsSpeechApiKey(env)).trim();
  const baseUrl = (options.baseUrl ?? pollinationsTtsUrl(env)).replace(/\/+$/, "");
  // Accept either the base address or the full endpoint in the override.
  const endpoint = /\/v1\/audio\/speech$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1/audio/speech`;
  const model = options.model ?? pollinationsTtsModel(env);
  const doFetch = options.fetchImpl ?? fetch;

  return {
    id: "pollinations",
    label: "Pollinations / ElevenLabs voices",

    async synthesize({ text, voice, speed, signal }: SpeechRequest): Promise<SpeechAudio> {
      if (!apiKey) {
        throw new SpeechProviderError("POLLINATIONS_API_KEY is not set", "unavailable");
      }
      const voiceId = speechVoiceId("pollinations", voice, env);

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          signal,
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            voice: voiceId,
            input: text,
            response_format: "mp3",
            speed: Math.min(2, Math.max(0.5, speed)),
          }),
        });
      } catch (error) {
        throw fetchError(error, signal);
      }

      if (!response.ok) {
        const needsKey = response.status === 401 || response.status === 402 || response.status === 403;
        throw new SpeechProviderError(
          needsKey
            ? "The speech service refused the request (key or credits needed)"
            : `Speech service responded with HTTP ${response.status}`,
          needsKey ? "unavailable" : "upstream",
          response.status,
        );
      }

      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      if (type && !type.startsWith("audio/") && !type.startsWith("application/octet-stream")) {
        throw new SpeechProviderError("The speech service did not send audio", "bad_response");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        throw new SpeechProviderError("The speech service sent empty audio", "bad_response");
      }
      return {
        bytes,
        mime: type.startsWith("audio/") ? type.split(";")[0]! : "audio/mpeg",
        provider: "pollinations",
        voiceId,
      };
    },
  };
}

function fetchError(error: unknown, signal: AbortSignal): SpeechProviderError {
  if (signal.aborted) {
    const reason = signal.reason as { name?: string } | undefined;
    return reason?.name === "TimeoutError"
      ? new SpeechProviderError("Speech service timed out", "timeout")
      : new SpeechProviderError("Speech request was cancelled", "aborted");
  }
  return new SpeechProviderError(
    `Speech service unreachable: ${(error as Error)?.message ?? "unknown error"}`,
    "unavailable",
  );
}
