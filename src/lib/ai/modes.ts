/**
 * Response modes — the same idea as the mode pickers in ChatGPT, Claude and
 * Gemini: one chat, four ways to answer.
 *
 *   fast      shortest useful answer, no private thinking
 *   thinking  reasons carefully before answering (the default)
 *   coding    complete, runnable code first, explanation second
 *   analyze   structured breakdown, evidence and a recommendation
 *
 * This file is imported by BOTH the browser (the picker) and the server
 * (mode selection + model settings). Prompt text lives in mode-prompts.ts so
 * long system instructions stay out of the browser bundle.
 */

export const CHAT_MODES = ["thinking", "fast", "coding", "analyze"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

/** Used when nothing is stored yet, and for requests from older clients. */
export const DEFAULT_CHAT_MODE: ChatMode = "thinking";

export type ModeConfig = {
  id: ChatMode;
  /** Name in the picker. */
  label: string;
  /** One line under the name. */
  summary: string;
  /** Live label while waiting for the first word. */
  waiting: string;
  /** Let the model reason privately before it answers. */
  thinking: boolean;
  temperature: number;
  topP: number;
  /** Upper bound; the selected provider may apply a lower ceiling. */
  maxTokens: number;
  /** How many earlier turns are sent as context. */
  historyLimit: number;
};

export const MODE_CONFIG: Record<ChatMode, ModeConfig> = {
  thinking: {
    id: "thinking",
    label: "Thinking",
    summary: "Reasons it through",
    waiting: "Thinking",
    thinking: true,
    temperature: 0.7,
    topP: 0.95,
    maxTokens: 4096,
    historyLimit: 20,
  },

  fast: {
    id: "fast",
    label: "Fast",
    summary: "Shortest useful answer",
    waiting: "Thinking",
    thinking: false,
    temperature: 0.4,
    topP: 0.9,
    maxTokens: 1024,
    historyLimit: 12,
  },

  coding: {
    id: "coding",
    label: "Coding",
    summary: "Complete, runnable code",
    waiting: "Writing code",
    // Private reasoning shares NVIDIA's output-token budget; reserve it for source code.
    thinking: false,
    temperature: 0.2,
    topP: 0.9,
    // Multi-file tasks are planned and emitted one file at a time; a large
    // individual file can still use the provider's continuation path.
    maxTokens: 65_536,
    historyLimit: 16,
  },

  analyze: {
    id: "analyze",
    label: "Analyze",
    summary: "Structured breakdown",
    waiting: "Analyzing",
    thinking: true,
    temperature: 0.4,
    topP: 0.95,
    maxTokens: 6144,
    historyLimit: 20,
  },
};

/** Picker order: the default first, then the faster/working modes. */
export const MODE_LIST: ModeConfig[] = CHAT_MODES.map((mode) => MODE_CONFIG[mode]);

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODES as readonly string[]).includes(value);
}

/** Never throws: an unknown/old value falls back to the default mode. */
export function resolveChatMode(value: unknown, fallback: ChatMode = DEFAULT_CHAT_MODE): ChatMode {
  return isChatMode(value) ? value : fallback;
}

export function resolveModeConfig(value: unknown): ModeConfig {
  return MODE_CONFIG[resolveChatMode(value)];
}

/**
 * Model settings for a mode, respecting an environment token ceiling.
 * A reasonable ceiling always wins; only an absurdly small one (under 256) is
 * lifted, because an answer shorter than that is not an answer.
 */
export function modeModelSettings(mode: ChatMode, tokenCeiling = MODE_CONFIG[mode].maxTokens) {
  const config = MODE_CONFIG[mode];
  return {
    thinking: config.thinking,
    temperature: config.temperature,
    topP: config.topP,
    maxTokens: Math.max(256, Math.min(config.maxTokens, tokenCeiling)),
    historyLimit: config.historyLimit,
  };
}
