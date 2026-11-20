import "server-only";
import { createMockProvider } from "./providers/mock";
import { createSujanCoreProvider } from "./providers/sujan-core";
import { resolveAiSettings, type AiProviderId } from "./settings";
import type { AiProvider } from "./types";

/**
 * ─── The swappable AI provider ───
 * Choose with the AI_PROVIDER environment variable (default: "sujan-core").
 *
 * To add a new AI service:
 *   1. Copy providers/sujan-core.ts to providers/my-ai.ts and adapt the request/response.
 *   2. Add it to `providers` below:   "my-ai": createMyAiProvider,
 *   3. Add "my-ai" to KNOWN_AI_PROVIDERS in ./settings.ts.
 *   4. Set AI_PROVIDER=my-ai in .env.local / Vercel.
 */
const providers: Record<AiProviderId, (url: string) => AiProvider> = {
  "sujan-core": (url) => createSujanCoreProvider({ url }),
  mock: createMockProvider,
};

let cached: { key: string; provider: AiProvider } | undefined;

export function getAiProvider(): AiProvider {
  const settings = resolveAiSettings();
  const key = `${settings.id}|${settings.url}`;
  if (cached?.key === key) return cached.provider;
  // Mistakes in AI_PROVIDER no longer break chat: we log a tip and carry on.
  if (settings.warning) console.warn(`[proxima] ${settings.warning}`);
  cached = { key, provider: providers[settings.id](settings.url) };
  return cached.provider;
}

export { resolveAiSettings } from "./settings";

export const AI_TIMEOUT_MS = () => Number(process.env.AI_TIMEOUT_MS) || 90_000;

export { AiProviderError, type AiProvider, type AiRequest } from "./types";
