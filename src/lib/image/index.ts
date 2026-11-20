import "server-only";
import { createFallbackImageProvider } from "./providers/chain";
import { createMockImageProvider } from "./providers/mock";
import { createNvidiaImageProvider } from "./providers/nvidia";
import { createOpenAiImageProvider } from "./providers/openai";
import { createPollinationsImageProvider } from "./providers/pollinations";
import {
  nvidiaImageConfigured,
  openaiImageConfigured,
  resolveImageSettings,
  type ConcreteImageProviderId,
} from "./settings";
import type { ImageProvider } from "./types";

/**
 * ─── The swappable image engine ───
 *
 * IMAGE_PROVIDER picks the first engine; the list below adds automatic
 * fallbacks so "Generate" always returns a picture:
 *
 *   auto         OpenAI (if a key) → NVIDIA (if a key) → Pollinations → offline
 *   openai       OpenAI only
 *   nvidia       NVIDIA only (create; editing falls through to another engine)
 *   pollinations keyless service only
 *   mock         offline preview only
 *
 * Add a new service: create providers/my-engine.ts, add it to `create` and to
 * KNOWN_IMAGE_PROVIDERS in ./settings.ts.
 */
const create: Record<ConcreteImageProviderId, () => ImageProvider> = {
  openai: () => createOpenAiImageProvider(),
  nvidia: () => createNvidiaImageProvider(),
  pollinations: () => createPollinationsImageProvider(),
  mock: () => createMockImageProvider(),
};

let cached: { key: string; provider: ImageProvider } | undefined;

function cacheKey(): string {
  const settings = resolveImageSettings();
  return [
    settings.id,
    openaiImageConfigured() ? "openai:yes" : "openai:no",
    nvidiaImageConfigured() ? "nvidia:yes" : "nvidia:no",
    (process.env.OPENAI_IMAGE_MODEL ?? "").trim(),
    (process.env.NVIDIA_IMAGE_MODEL ?? "").trim(),
    (process.env.POLLINATIONS_IMAGE_URL ?? "").trim(),
  ].join("|");
}

/** Builds the engine list for a provider choice (exported for tests). */
export function buildImageProviders(id: ConcreteImageProviderId): ImageProvider[] {
  switch (id) {
    case "openai":
      return [create.openai(), create.mock()];
    case "nvidia":
      return [create.nvidia(), create.openai(), create.mock()];
    case "pollinations":
      return [create.pollinations(), create.mock()];
    case "mock":
      return [create.mock()];
  }
}

/** The provider for this request, including automatic fallbacks. */
export function getImageProvider(): ImageProvider {
  const key = cacheKey();
  if (cached?.key === key) return cached.provider;

  const settings = resolveImageSettings();
  if (settings.warning) console.warn(`[proxima] ${settings.warning}`);

  let providers: ImageProvider[];
  if (settings.id === "auto") {
    providers = [];
    if (openaiImageConfigured()) providers.push(create.openai());
    if (nvidiaImageConfigured()) providers.push(create.nvidia());
    // Keyless and always available, so the feature works out of the box.
    providers.push(create.pollinations());
    // Last resort: an offline preview instead of an error.
    providers.push(create.mock());
  } else {
    providers = buildImageProviders(settings.id);
  }

  const provider = providers.length === 1 ? providers[0] : createFallbackImageProvider(providers);
  cached = { key, provider };
  return provider;
}

/** Tests and scripts: forget the cached engine (after changing env vars). */
export function resetImageProviderCache(): void {
  cached = undefined;
}

export { IMAGE_LIMITS, IMAGE_SIZES, IMAGE_STYLES, buildImagePrompt } from "./limits";
export { ImageProviderError } from "./types";
export { imageTimeoutMs, resolveImageSettings } from "./settings";
export type { GeneratedImage, ImageProvider } from "./types";
