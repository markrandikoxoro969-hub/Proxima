import "server-only";
import { createFallbackImageProvider } from "./providers/chain";
import { createMockImageProvider } from "./providers/mock";
import { createNvidiaImageProvider } from "./providers/nvidia";
import { createOpenAiImageProvider } from "./providers/openai";
import {
  imageWatermarkNote,
  nvidiaEditConfigured,
  nvidiaImageConfigured,
  nvidiaImageEditModel,
  nvidiaImageModel,
  openaiImageConfigured,
  openaiImageModel,
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
 *   auto         NVIDIA FLUX (if a key) → OpenAI (if a key) → offline
 *   openai       OpenAI only (create + edit)
 *   nvidia       NVIDIA FLUX create + Kontext edit, then OpenAI/offline
 *   mock         offline preview only
 *
 * Add a new service: create providers/my-engine.ts, add it to `create` and to
 * KNOWN_IMAGE_PROVIDERS in ./settings.ts.
 */
const create: Record<ConcreteImageProviderId, () => ImageProvider> = {
  openai: () => createOpenAiImageProvider(),
  nvidia: () => createNvidiaImageProvider(),
  mock: () => createMockImageProvider(),
};

let cached: { key: string; provider: ImageProvider } | undefined;

function cacheKey(): string {
  const settings = resolveImageSettings();
  return [
    settings.id,
    openaiImageConfigured() ? "openai:yes" : "openai:no",
    nvidiaImageConfigured() ? "nvidia:yes" : "nvidia:no",
    nvidiaEditConfigured() ? "nvidia-edit:yes" : "nvidia-edit:no",
    openaiImageModel(),
    nvidiaImageModel(),
    nvidiaImageEditModel(),
    // Only whether a key exists goes into the cache key — never the key itself.
  ].join("|");
}

/** Builds the engine list for a provider choice (exported for tests). */
export function buildImageProviders(id: ConcreteImageProviderId): ImageProvider[] {
  switch (id) {
    case "openai":
      return [create.openai(), create.mock()];
    case "nvidia":
      return [create.nvidia(), create.openai(), create.mock()];
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
    if (nvidiaImageConfigured()) providers.push(create.nvidia());
    if (openaiImageConfigured()) providers.push(create.openai());
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
export { imageTimeoutMs, imageWatermarkNote, resolveImageSettings } from "./settings";

/** What the studio shows about the engine that answered (never a key). */
export function imageEngineInfo(provider: ImageProvider) {
  return { id: provider.id, label: provider.label, note: imageWatermarkNote() };
}
export type { GeneratedImage, ImageProvider } from "./types";
