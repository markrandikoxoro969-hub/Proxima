/**
 * Works out which natural-voice engine to use, from the environment.
 *
 *   SPEECH_PROVIDER="auto"         → OpenAI (if a key) → Pollinations (if a key)
 *                                    → Microsoft Edge neural voices (free)
 *   SPEECH_PROVIDER="openai"       → OpenAI TTS
 *   SPEECH_PROVIDER="pollinations" → Pollinations / ElevenLabs (needs a key)
 *   SPEECH_PROVIDER="edge"         → Microsoft Edge Read Aloud voices (free)
 *   SPEECH_PROVIDER="off"          → never use a natural voice; the browser's
 *                                    own speech synthesis still works
 *
 * Keys are read only inside the provider that needs them. They are never
 * logged, returned, or sent to the browser.
 */
export const KNOWN_SPEECH_PROVIDERS = ["auto", "openai", "pollinations", "edge", "off"] as const;
export type SpeechProviderId = (typeof KNOWN_SPEECH_PROVIDERS)[number];
export type ConcreteSpeechProviderId = Exclude<SpeechProviderId, "auto" | "off">;

export const DEFAULT_SPEECH_PROVIDER: SpeechProviderId = "auto";
export const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_POLLINATIONS_TTS_MODEL = "tts-1";
export const DEFAULT_POLLINATIONS_TTS_URL = "https://gen.pollinations.ai";

export type SpeechSettings = {
  /** What SPEECH_PROVIDER said, after forgiving common mistakes. */
  id: SpeechProviderId;
  /** A note for the logs when a setting looked wrong (never a key). */
  warning?: string;
};

export function resolveSpeechSettings(env: Record<string, string | undefined> = process.env): SpeechSettings {
  const raw = (env.SPEECH_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) return { id: DEFAULT_SPEECH_PROVIDER };
  if ((KNOWN_SPEECH_PROVIDERS as readonly string[]).includes(raw)) {
    return { id: raw as SpeechProviderId };
  }
  if (/^https?:\/\//.test(raw)) {
    return {
      id: DEFAULT_SPEECH_PROVIDER,
      warning: 'SPEECH_PROVIDER looks like a web address; it should be a name like "edge". Using auto.',
    };
  }
  return {
    id: DEFAULT_SPEECH_PROVIDER,
    warning: `SPEECH_PROVIDER "${raw}" is unknown (options: ${KNOWN_SPEECH_PROVIDERS.join(", ")}). Using auto.`,
  };
}

/** Edge voices are the "free, no key" neural pair. Both are conversational. */
export const DEFAULT_EDGE_VOICES: Record<"girl" | "boy", string> = {
  girl: "en-US-AvaNeural",
  boy: "en-US-AndrewNeural",
};

/** OpenAI's newest built-in voices; `gpt-4o-mini-tts` also takes instructions. */
export const DEFAULT_OPENAI_VOICES: Record<"girl" | "boy", string> = {
  girl: "marin",
  boy: "cedar",
};

/** Pollinations exposes OpenAI-compatible voice names on its speech endpoint. */
export const DEFAULT_POLLINATIONS_VOICES: Record<"girl" | "boy", string> = {
  girl: "nova",
  boy: "onyx",
};

const VOICE_DEFAULTS: Record<ConcreteSpeechProviderId, Record<"girl" | "boy", string>> = {
  edge: DEFAULT_EDGE_VOICES,
  openai: DEFAULT_OPENAI_VOICES,
  pollinations: DEFAULT_POLLINATIONS_VOICES,
};

/**
 * The voice id for one engine and one Proxima voice. Every engine can be
 * overridden without touching code, which matters because voice catalogues
 * change (for example a new multilingual Edge voice):
 *
 *   SPEECH_EDGE_VOICE_GIRL="en-US-EmmaMultilingualNeural"
 */
export function speechVoiceId(
  provider: ConcreteSpeechProviderId,
  voice: "girl" | "boy",
  env: Record<string, string | undefined> = process.env,
): string {
  const key = `SPEECH_${provider.toUpperCase()}_VOICE_${voice.toUpperCase()}`;
  return (env[key] ?? "").trim() || VOICE_DEFAULTS[provider][voice];
}

export const openaiSpeechConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean((env.OPENAI_API_KEY ?? "").trim());

export const pollinationsSpeechApiKey = (env: Record<string, string | undefined> = process.env) =>
  ((env.POLLINATIONS_API_KEY ?? env.POLLINATIONS_TOKEN ?? "") as string).trim();

export const pollinationsSpeechConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(pollinationsSpeechApiKey(env));

/** Set SPEECH_EDGE="off" to stop using Microsoft's unofficial endpoint. */
export const edgeSpeechConfigured = (env: Record<string, string | undefined> = process.env) =>
  (env.SPEECH_EDGE ?? "").trim().toLowerCase() !== "off";

/** How long to wait for a natural voice before falling back (ms). */
export const speechTimeoutMs = (env: Record<string, string | undefined> = process.env) => {
  const value = Number(env.SPEECH_TIMEOUT_MS);
  // The route is limited to 30 s; keep the provider deadline inside it.
  return Number.isFinite(value) && value > 0 ? Math.min(value, 25_000) : 25_000;
};

export const openaiTtsModel = (env: Record<string, string | undefined> = process.env) =>
  (env.SPEECH_OPENAI_MODEL ?? "").trim() || DEFAULT_OPENAI_TTS_MODEL;

export const pollinationsTtsModel = (env: Record<string, string | undefined> = process.env) =>
  (env.SPEECH_POLLINATIONS_MODEL ?? "").trim() || DEFAULT_POLLINATIONS_TTS_MODEL;

export const pollinationsTtsUrl = (env: Record<string, string | undefined> = process.env) =>
  ((env.SPEECH_POLLINATIONS_URL ?? "").trim() || DEFAULT_POLLINATIONS_TTS_URL).replace(/\/$/, "");
