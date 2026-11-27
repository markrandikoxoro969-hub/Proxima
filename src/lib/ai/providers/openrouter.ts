import "server-only";
import { cleanEnvValue } from "@/lib/env-clean";
import { globalConfig } from "@/lib/global-config";
import { resolveNvidiaSettings } from "../settings";
import type { AiProvider } from "../types";
import { createNvidiaProvider, type NvidiaOptions } from "./nvidia";

export const OPENROUTER_CODING_MODEL = globalConfig.ai.openrouter.codingModel;
export const OPENROUTER_CODING_MAX_TOKENS = globalConfig.ai.openrouter.codingMaxTokens;
export const OPENROUTER_BASE_URL = globalConfig.ai.openrouter.baseUrl;

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
