import "server-only";
import { createMockProvider } from "./providers/mock";
import { createSujanCoreProvider } from "./providers/sujan-core";
import type { AiProvider } from "./types";

/**
 * ─── The swappable AI provider ───
 * Choose with the AI_PROVIDER environment variable (default: "sujan-core").
 *
 * To add a new AI service:
 *   1. Copy providers/sujan-core.ts to providers/my-ai.ts and adapt the request/response.
 *   2. Add it to `providers` below:   "my-ai": createMyAiProvider,
 *   3. Set AI_PROVIDER=my-ai in .env.local / Vercel.
 */
const providers: Record<string, () => AiProvider> = {
  "sujan-core": () => createSujanCoreProvider(),
  mock: createMockProvider,
};

let cached: { id: string; provider: AiProvider } | undefined;

export function getAiProvider(): AiProvider {
  const id = process.env.AI_PROVIDER || "sujan-core";
  if (cached?.id === id) return cached.provider;
  const factory = providers[id];
  if (!factory) {
    throw new Error(`Unknown AI_PROVIDER "${id}". Options: ${Object.keys(providers).join(", ")}`);
  }
  cached = { id, provider: factory() };
  return cached.provider;
}

export const AI_TIMEOUT_MS = () => Number(process.env.AI_TIMEOUT_MS) || 90_000;

export { AiProviderError, type AiProvider, type AiRequest } from "./types";
