import "server-only";
import { createFallbackImageProvider } from "./providers/chain";
import { createMockImageProvider } from "./providers/mock";
import { createNvidiaImageProvider } from "./providers/nvidia";
import { createOpenAiImageProvider } from "./providers/openai";
import { createPollinationsImageProvider } from "./providers/pollinations";
import {
  imageWatermarkNote,
  nvidiaEditConfigured,
  nvidiaImageConfigured,
  nvidiaImageEditModel,
  nvidiaImageModel,
  openaiImageConfigured,
  openaiImageModel,
  pollinationsImageConfigured,
  pollinationsImageModel,
  pollinationsEditModel,
  resolveImageSettings,
  type ConcreteImageProviderId,
} from "./settings";
import type { ImageProvider } from "./types";

/**
 * ─── The swappable image engine ───
 *
 * IMAGE_PROVIDER picks the first engine; the list below adds automatic
 * fallbacks for real services; the preview is used only when none is configured:
 *
 *   auto         Pollinations → NVIDIA FLUX → OpenAI when configured, or offline
 *   pollinations Pollinations only (create + edit)
 *   openai       OpenAI only (create + edit)
 *   nvidia       NVIDIA FLUX create + Kontext edit, then OpenAI if configured
 *   mock         offline preview only
 *
 * Add a new service: create providers/my-engine.ts, add it to `create` and to
 * KNOWN_IMAGE_PROVIDERS in ./settings.ts.
 */
const create: Record<ConcreteImageProviderId, () => ImageProvider> = {
  openai: () => createOpenAiImageProvider(),
  pollinations: () => createPollinationsImageProvider(),
  nvidia: () => createNvidiaImageProvider(),
  mock: () => createMockImageProvider(),
};

let cached: { key: string; provider: ImageProvider } | undefined;

function cacheKey(): string {
  const settings = resolveImageSettings();
  return [
    settings.id,
    pollinationsImageConfigured() ? "pollinations:yes" : "pollinations:no",
    pollinationsImageModel(),
    pollinationsEditModel(),
    openaiImageConfigured() ? "openai:yes" : "openai:no",
    nvidiaImageConfigured() ? "nvidia:yes" : "nvidia:no",
    nvidiaEditConfigured() ? "nvidia-edit:yes" : "nvidia-edit:no",
    openaiImageModel(),
    nvidiaImageModel(),
    nvidiaImageEditModel(),
    process.env.IMAGE_EDITING_URL ?? "",
    // Only whether a key exists goes into the cache key — never the key itself.
  ].join("|");
}

/** Builds the engine list for a provider choice (exported for tests). */
export function buildImageProviders(id: ConcreteImageProviderId): ImageProvider[] {
  switch (id) {
    case "pollinations":
      return [create.pollinations()];
    case "openai":
      return [create.openai()];
    case "nvidia":
      return [create.nvidia(), ...(openaiImageConfigured() ? [create.openai()] : [])];
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
    if (pollinationsImageConfigured()) providers.push(create.pollinations());
    if (nvidiaImageConfigured() || nvidiaEditConfigured()) providers.push(create.nvidia());
    if (openaiImageConfigured()) providers.push(create.openai());
    // Only use the preview when no real service is configured.
    if (providers.length === 0) providers.push(create.mock());
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
