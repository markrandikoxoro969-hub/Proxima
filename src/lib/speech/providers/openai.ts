import "server-only";
import OpenAI from "openai";
import { openaiTtsModel, speechVoiceId } from "../settings";
import { SpeechProviderError, type SpeechAudio, type SpeechProvider, type SpeechRequest } from "../types";

/**
 * OpenAI text-to-speech.
 *
 * `gpt-4o-mini-tts` is the natural, steerable model: the `instructions` field
 * keeps the delivery conversational instead of "reading the news". The newest
 * built-in voices are Marin (warm female) and Cedar (calm male).
 *
 * Only used when OPENAI_API_KEY is set. The key never leaves this module.
 */
export type OpenAiSpeechOptions = {
  /** Injected in tests so no network call is made. */
  client?: OpenAI;
  apiKey?: string;
  model?: string;
  env?: Record<string, string | undefined>;
};

const INSTRUCTIONS =
  "Speak like a warm, thoughtful friend who knows the subject well. Natural pace, clear emphasis, " +
  "small pauses at punctuation. Never sound like an announcer or a call-centre recording.";

export function createOpenAiSpeechProvider(options: OpenAiSpeechOptions = {}): SpeechProvider {
  const env = options.env ?? process.env;
  const model = options.model ?? openaiTtsModel(env);
  const apiKey = options.apiKey ?? (env.OPENAI_API_KEY ?? "").trim();

  let client = options.client;
  const getClient = () => {
    if (!client) {
      if (!apiKey) throw new SpeechProviderError("OPENAI_API_KEY is not set", "unavailable");
      client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 });
    }
    return client;
  };

  return {
    id: "openai",
    label: `OpenAI ${model}`,

    async synthesize({ text, voice, speed, signal }: SpeechRequest): Promise<SpeechAudio> {
      if (!apiKey && !options.client) {
        throw new SpeechProviderError("OPENAI_API_KEY is not set", "unavailable");
      }
      const voiceId = speechVoiceId("openai", voice, env);
      try {
        const response = await getClient().audio.speech.create(
          {
            model,
            voice: voiceId,
            input: text,
            response_format: "mp3",
            speed: Math.min(2, Math.max(0.5, speed)),
            // Supported by gpt-4o-mini-tts; ignored by the older tts-1 models.
            ...(model.startsWith("gpt-4o") ? { instructions: INSTRUCTIONS } : {}),
          },
          { signal },
        );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0) {
          throw new SpeechProviderError("OpenAI returned no audio", "bad_response");
        }
        return { bytes, mime: "audio/mpeg", provider: "openai", voiceId };
      } catch (error) {
        throw toSpeechError(error, signal);
      }
    },
  };
}

function toSpeechError(error: unknown, signal: AbortSignal): SpeechProviderError {
  if (error instanceof SpeechProviderError) return error;
  if (signal.aborted) {
    const reason = signal.reason as { name?: string } | undefined;
    return reason?.name === "TimeoutError"
      ? new SpeechProviderError("OpenAI voice timed out", "timeout")
      : new SpeechProviderError("OpenAI voice request was cancelled", "aborted");
  }
  const status = (error as { status?: number })?.status;
  if ((error as { name?: string })?.name === "APIConnectionTimeoutError") {
    return new SpeechProviderError("OpenAI voice timed out", "timeout");
  }
  if (typeof status === "number") {
    return new SpeechProviderError(`OpenAI responded with HTTP ${status}`, "upstream", status);
  }
  return new SpeechProviderError(
    `OpenAI voice request failed: ${(error as Error)?.message ?? "unknown error"}`,
    "unavailable",
  );
}
