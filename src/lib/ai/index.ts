import "server-only";
import { createFallbackProvider } from "./providers/chain";
import { createMockProvider } from "./providers/mock";
import { createNvidiaProvider, nvidiaConfigured } from "./providers/nvidia";
import { createSujanCoreProvider } from "./providers/sujan-core";
import { resolveAiSettings, resolveNvidiaSettings, type NormalizedProviderId } from "./settings";
import type { AiProvider } from "./types";

/**
 * ─── The swappable AI provider ───
 *
 * AI_PROVIDER selects the first provider. NVIDIA (default) automatically falls
 * back to the Render API if it fails before answering — see providers/chain.ts.
 *
 * To add another AI service:
 *   1. Copy providers/nvidia.ts to providers/my-ai.ts and adapt it.
 *   2. Add it to `create` below and to KNOWN_AI_PROVIDERS in ./settings.ts.
 *   3. Set AI_PROVIDER=my-ai in .env.local / Vercel.
 */
const create: Record<NormalizedProviderId, (url: string) => AiProvider> = {
  nvidia: () => createNvidiaProvider(),
  render: (url) => createSujanCoreProvider({ url }),
  mock: createMockProvider,
};

let cached: { key: string; provider: AiProvider } | undefined;

function cacheKey(): string {
  const settings = resolveAiSettings();
  const nvidia = resolveNvidiaSettings();
  return [
    settings.id,
    settings.url,
    nvidia.model,
    nvidia.visionModel,
    nvidia.baseURL,
    String(nvidia.maxTokens),
    String(nvidia.enableThinking),
    String(nvidia.firstTokenTimeoutMs),
    // Never put the key itself in a string that could end up in a log.
    nvidiaConfigured() ? "nvidia-key:yes" : "nvidia-key:no",
  ].join("|");
}

/** The provider for this request, including the automatic fallback. */
export function getAiProvider(): AiProvider {
  const key = cacheKey();
  if (cached?.key === key) return cached.provider;

  const settings = resolveAiSettings();
  if (settings.warning) console.warn(`[proxima] ${settings.warning}`);

  let provider = create[settings.id](settings.url);

  if (settings.id === "nvidia") {
    const render = create.render(settings.url);
    if (!nvidiaConfigured()) {
      // No key yet: behave exactly like before, without a failed request first.
      console.warn("[proxima] NVIDIA_API_KEY is not set — using the Render API.");
      provider = render;
    } else {
      provider = createFallbackProvider({
        primary: createNvidiaProvider(),
        fallback: render,
        primaryTimeoutMs: resolveNvidiaSettings().firstTokenTimeoutMs,
      });
    }
  }

  cached = { key, provider };
  return provider;
}

/** Tests and scripts: forget the cached provider (after changing env vars). */
export function resetAiProviderCache(): void {
  cached = undefined;
}

export { resolveAiSettings } from "./settings";
export { SYSTEM_PROMPT } from "./prompt";

export const AI_TIMEOUT_MS = () => Number(process.env.AI_TIMEOUT_MS) || 110_000;

export { AiProviderError, type AiDelta, type AiProvider, type AiRequest } from "./types";
