/**
 * ─── Answer modes ───
 *
 * Four ways to ask the same question, chosen with one tap in the composer:
 *
 *   Thinking  the default: reason first, then a tight answer
 *   Fast      the shortest answer that actually works
 *   Pro       thorough, structured, with trade-offs
 *   Coding    runnable code first, short notes after
 *
 * A mode is *one extra paragraph* in the system prompt. That keeps it honest:
 * it works with every provider, it can never break the reply pipeline, and the
 * answer still streams at full speed.
 */
export const MODES = [
  {
    id: "thinking",
    label: "Thinking",
    blurb: "Reasons it out, then answers. Good for hard questions.",
  },
  {
    id: "fast",
    label: "Fast",
    blurb: "Shortest useful answer. Good for quick facts.",
  },
  {
    id: "pro",
    label: "Pro",
    blurb: "Thorough and structured, with trade-offs.",
  },
  {
    id: "coding",
    label: "Coding",
    blurb: "Runnable code first, explanation after.",
  },
] as const;

export type ChatMode = (typeof MODES)[number]["id"];

export const DEFAULT_MODE: ChatMode = "thinking";

export const MODE_IDS = MODES.map((mode) => mode.id) as readonly ChatMode[];

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (MODE_IDS as readonly string[]).includes(value);
}

/** The one paragraph each mode adds to the system prompt. */
const INSTRUCTIONS: Record<ChatMode, string> = {
  thinking:
    "Mode: Thinking. Work the problem through before you answer, and correct yourself when a step is wrong. " +
    "Show the reasoning only when it helps the person follow the answer; the final answer stays tight.",
  fast: "Mode: Fast. Answer in the fewest words that fully solve the question — usually one or two sentences. " +
    "No reasoning, no examples, no caveats unless they are the answer.",
  pro: "Mode: Pro. Answer directly first, then the reasoning that matters: trade-offs, edge cases, the steps to take, " +
    "and what to watch out for. Structure only when it clarifies.",
  coding:
    "Mode: Coding. Put runnable code first, in one fenced block with its language tag, complete enough to run as-is. " +
    "Name the file when it matters, then at most a few short bullets on why it works and what to change. " +
    "Never invent an API — if you are not sure it exists, say so.",
};

export function modeInstruction(mode: ChatMode | undefined): string {
  return INSTRUCTIONS[isChatMode(mode) ? mode : DEFAULT_MODE];
}

/** Base prompt + mode paragraph (+ memory, added by the caller). */
export function withMode(systemPrompt: string, mode: ChatMode | undefined): string {
  return `${systemPrompt}\n\n${modeInstruction(mode)}`;
}
