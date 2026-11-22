import "server-only";
import { cleanEnvValue } from "@/lib/env-clean";
import { resolveNvidiaSettings } from "../settings";
import type { AiProvider } from "../types";
import { createNvidiaProvider, type NvidiaOptions } from "./nvidia";

export const OPENROUTER_CODING_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const OPENROUTER_CODING_MAX_TOKENS = 65_536;
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const openRouterKey = (env: Record<string, string | undefined> = process.env) =>
  cleanEnvValue(env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY") ?? "";

export const openRouterConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(openRouterKey(env));

/** OpenRouter is OpenAI-compatible; reuse streaming, continuations and the NVIDIA vision reader. */
export function createOpenRouterProvider(options: NvidiaOptions = {}): AiProvider {
  const nvidia = resolveNvidiaSettings();
  return createNvidiaProvider({
    ...options,
    protocol: "openrouter",
    visionBaseURL: nvidia.baseURL,
    settings: {
      ...nvidia,
      apiKey: openRouterKey(),
      baseURL: OPENROUTER_BASE_URL,
      model: OPENROUTER_CODING_MODEL,
      maxTokens: OPENROUTER_CODING_MAX_TOKENS,
      enableThinking: false,
      ...options.settings,
    },
  });
}
