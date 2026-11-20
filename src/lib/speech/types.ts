/**
 * The contract every natural-voice engine follows.
 *
 * A provider receives clean, speakable text (no Markdown) and returns the
 * encoded audio. The browser never talks to a voice vendor directly: it asks
 * `/api/speech`, so keys stay on the server and the same feature works in
 * Safari, Firefox and Chrome.
 *
 * To add another service: copy a file in ./providers, export a factory that
 * returns a `SpeechProvider`, and register it in ./index.ts.
 */

export const SPEECH_VOICES = ["girl", "boy"] as const;
export type SpeechVoice = (typeof SPEECH_VOICES)[number];

export function isSpeechVoice(value: unknown): value is SpeechVoice {
  return value === "girl" || value === "boy";
}

export type SpeechRequest = {
  /** Clean text, at most LIMITS.speechChunkMax characters. */
  text: string;
  voice: SpeechVoice;
  /** 0.5 … 2; 1 is the voice's natural pace. */
  speed: number;
  signal: AbortSignal;
};

export type SpeechAudio = {
  bytes: Uint8Array;
  /** Usually audio/mpeg. */
  mime: string;
  /** Which engine answered ("edge", "openai"…), for logs and headers. */
  provider: string;
  /** The provider's own voice id, never a key. */
  voiceId: string;
};

export type SpeechErrorCode =
  "unavailable" | "timeout" | "upstream" | "bad_response" | "unsupported" | "aborted";

/** Thrown by providers; the route turns this into one friendly 503. */
export class SpeechProviderError extends Error {
  constructor(
    message: string,
    public readonly code: SpeechErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SpeechProviderError";
  }
}

export interface SpeechProvider {
  /** Short id used in SPEECH_PROVIDER, e.g. "edge". */
  readonly id: string;
  /** Human-friendly name for logs (never shown with a key). */
  readonly label: string;
  synthesize(request: SpeechRequest): Promise<SpeechAudio>;
}
