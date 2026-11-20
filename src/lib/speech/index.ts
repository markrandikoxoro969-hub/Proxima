import "server-only";
import { createFallbackSpeechProvider } from "./providers/chain";
import { createEdgeSpeechProvider } from "./providers/edge";
import { createOpenAiSpeechProvider } from "./providers/openai";
import { createPollinationsSpeechProvider } from "./providers/pollinations";
import {
  edgeSpeechConfigured,
  openaiSpeechConfigured,
  openaiTtsModel,
  pollinationsSpeechConfigured,
  pollinationsTtsModel,
  pollinationsTtsUrl,
  resolveSpeechSettings,
  type ConcreteSpeechProviderId,
} from "./settings";
import type { SpeechProvider } from "./types";

/**
 * ─── The natural-voice engine ───
 *
 * `SPEECH_PROVIDER` picks the chain; the first engine that returns audio wins:
 *
 *   auto         OpenAI (if a key) → Pollinations (if a key) → Edge (free)
 *   openai       OpenAI only
 *   pollinations Pollinations / ElevenLabs only
 *   edge         Microsoft Edge neural voices only
 *   off          no natural voice (the browser's own voice still works)
 *
 * The client always falls back to `speechSynthesis`, so a temporary provider
 * outage never makes the speaker button do nothing.
 */
const create: Record<ConcreteSpeechProviderId, () => SpeechProvider> = {
  openai: () => createOpenAiSpeechProvider(),
  pollinations: () => createPollinationsSpeechProvider(),
  edge: () => createEdgeSpeechProvider(),
};

/** The ordered engine ids for the current environment (exported for tests). */
export function speechProviderOrder(
  env: Record<string, string | undefined> = process.env,
): ConcreteSpeechProviderId[] {
  const settings = resolveSpeechSettings(env);
  if (settings.id === "off") return [];
  if (settings.id !== "auto") return [settings.id];

  const order: ConcreteSpeechProviderId[] = [];
  if (openaiSpeechConfigured(env)) order.push("openai");
  if (pollinationsSpeechConfigured(env)) order.push("pollinations");
  // Keyless, and the reason voice mode sounds natural with no setup at all.
  if (edgeSpeechConfigured(env)) order.push("edge");
  return order;
}

let cached: { key: string; provider: SpeechProvider } | undefined;

function cacheKey(order: ConcreteSpeechProviderId[]): string {
  return [
    order.join(">"),
    openaiSpeechConfigured() ? "openai:yes" : "openai:no",
    pollinationsSpeechConfigured() ? "pollinations:yes" : "pollinations:no",
    edgeSpeechConfigured() ? "edge:yes" : "edge:no",
    openaiTtsModel(),
    pollinationsTtsModel(),
    pollinationsTtsUrl(),
  ].join("|");
}

/** The provider for this request, including automatic fallbacks, or null if off. */
export function getSpeechProvider(): SpeechProvider | null {
  const order = speechProviderOrder();
  if (order.length === 0) return null;

  const key = cacheKey(order);
  if (cached?.key === key) return cached.provider;

  const settings = resolveSpeechSettings();
  if (settings.warning) console.warn(`[proxima] ${settings.warning}`);

  const providers = order.map((id) => create[id]());
  const provider = providers.length === 1 ? providers[0]! : createFallbackSpeechProvider(providers);
  cached = { key, provider };
  return provider;
}

/** Tests and scripts: forget the cached engine (after changing env vars). */
export function resetSpeechProviderCache(): void {
  cached = undefined;
}

export { SPEECH_VOICES, isSpeechVoice, SpeechProviderError } from "./types";
export type { SpeechAudio, SpeechProvider, SpeechRequest, SpeechVoice } from "./types";
export {
  DEFAULT_EDGE_VOICES,
  DEFAULT_OPENAI_VOICES,
  DEFAULT_POLLINATIONS_VOICES,
  KNOWN_SPEECH_PROVIDERS,
  edgeSpeechConfigured,
  openaiSpeechConfigured,
  pollinationsSpeechConfigured,
  resolveSpeechSettings,
  speechTimeoutMs,
  speechVoiceId,
} from "./settings";
