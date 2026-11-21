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
 * (the prompt + model settings). It therefore has no dependencies and no
 * "server-only" import: keep it that way.
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
  /** Upper bound; NVIDIA_MAX_TOKENS can lower it, never raise it past this. */
  maxTokens: number;
  /** How many earlier turns are sent as context. */
  historyLimit: number;
  /** Appended to the system prompt by modeSystemPrompt(). */
  guidance: string;
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
    guidance: [
      "Mode: Thinking.",
      "Work the problem through before you answer: check assumptions, look for edge cases, then give the result.",
      "Keep the working private. The answer itself should be calm, correct and no longer than it needs to be.",
      "For a hard question, a short plan or a few numbered steps is welcome; for an easy one, answer in a sentence.",
    ].join("\n"),
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
    guidance: [
      "Mode: Fast.",
      "Answer immediately in one to three sentences. No preamble, no restating the question, no long lists or headings.",
      "Include code or an example only when the answer would be wrong without it.",
      "If the request needs a long answer, give the single most useful part and offer to go deeper.",
    ].join("\n"),
  },

  coding: {
    id: "coding",
    label: "Coding",
    summary: "Complete, runnable code",
    waiting: "Writing code",
    thinking: true,
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 8192,
    historyLimit: 16,
    guidance: [
      "Mode: Coding.",
      "The code is the answer. Do not shorten it to fit the usual two-or-three-sentence style, and do not stop at a sketch when the request needs a working result.",
      'Think like a careful senior engineer. Return complete, runnable code — every import, every file, no "…" or "your code here" where real code belongs. If the answer needs several files, give each one its own fenced block with its path above it.',
      "Use the correct language tag on every fence. Handle empty, null, failure and edge cases; keep names clear and the code idiomatic.",
      "Before you finish, re-read what you wrote: every name must be defined, every bracket closed, and the example must run as written. If you could not test something, say which assumption you made.",
      "If the user pasted an error, name the root cause first, then show the fix. Never invent an API: if you are not sure it exists, say so.",
      "Keep the explanation after the code to a few short lines (how to run it, one assumption). Do not bury the code under a long essay.",
    ].join("\n"),
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
    guidance: [
      "Mode: Analyze.",
      "Break the question into its parts before answering. Separate what is known from what is assumed, and say which is which.",
      "Use short bullet points when comparing options, causes or evidence. Avoid tables unless the numbers genuinely need columns; if you use one, keep it to two narrow columns that read on a phone.",
      "Name each option or cause in full. Never use a letter, number or one-word label as a placeholder standing in for an explanation.",
      "Finish with a clear conclusion or recommendation, plus the main risk or the next thing worth checking.",
      "If the data is not enough for a firm conclusion, say what is missing instead of guessing.",
    ].join("\n"),
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
 * Base system prompt + this mode's rules. The mode section is last so it is
 * the freshest instruction the model reads.
 */
export function modeSystemPrompt(baseSystemPrompt: string, mode: ChatMode): string {
  return `${baseSystemPrompt.trim()}\n\n${MODE_CONFIG[mode].guidance}`;
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
