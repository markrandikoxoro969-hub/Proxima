import "server-only";

/**
 * ─── What PROXIMA remembers about you, between chats ───
 *
 * Most assistants forget everything the moment a conversation ends. This keeps
 * a *short* note list on the user row instead, so a question asked days later
 * can be answered in context:
 *
 *   Monday   "I'm going to the gym"          → remembered
 *   Thursday "which protein is good?"        → "You said you were at the gym a
 *                                              few days ago — what are you
 *                                              training? For strength work…"
 *
 * Two deliberate design choices:
 *
 * 1. **Deterministic, not another AI call.** Notes are pulled out with small
 *    pattern rules (below). That costs no tokens, can't invent facts, can't
 *    fail halfway through a streamed reply, and is unit-testable.
 * 2. **Bounded and visible.** Max 24 lines / 1,500 characters, never secrets,
 *    shown in Settings → Memory where the person can wipe it in one tap.
 */

/** Hard caps so the note list can never grow into a second chat log. */
export const MEMORY_MAX_LINES = 24;
export const MEMORY_MAX_CHARS = 1_500;

/** First words that make a sentence *about the person*, not about the task. */
const SELF = /\b(i|i'm|im|i’ve|i've|i'd|i'll|my|me|myself|we|we're)\b/i;

/** Anything that looks like a credential or an address never gets stored. */
const SECRET =
  /\b(password|passcode|api[-\s]?key|token|secret|otp|pin|card number|cvv|iban|ssn|social security|home address|i live at)\b/i;

/** A sentence that asks something is a question, not a fact about the person. */
const QUESTION = /\?|^\s*(what|why|how|when|where|who|which|can you|could you|do you|are you|is it)\b/i;

/** Small talk — remembering "hi" would waste the budget. */
const SMALL_TALK =
  /^\s*(hi|hey|hello|yo|thanks|thank you|ok|okay|cool|nice|yes|no|yeah|nope|lol|haha|good morning|good night|good evening)\b/i;

/** Cut a sentence down before it is stored. */
const MAX_LINE = 160;

/**
 * "1 day ago I'm going to gym" → "going to gym". The date column already holds
 * *when*, so repeating it in the sentence just makes the note harder to read.
 */
const LEADING_WHEN =
  /^(?:\d+\s+(?:second|minute|hour|day|week|month)s?\s+ago|yesterday|today|tonight|last night|this (?:morning|afternoon|evening))\b[\s,:;-]*/i;

export type MemoryEntry = { date: string; text: string };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Pulls durable, first-person statements out of one message.
 *
 * "1 day ago I'm going to gym"            → "going to gym"
 * "my name is Sujan and i study physics"  → both halves, as two notes
 * "which protein is good?"                → nothing (a question)
 */
export function extractMemories(message: string, today: Date = new Date()): string[] {
  const date = isoDay(today);
  const cleaned = message
    // Files and pictures are described in brackets by composePrompt; not a fact.
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 4) return [];

  const sentences = cleaned
    .split(/(?<=[.!?;])\s+|\s+(?:because|so|but|and then)\s+/i)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const found: string[] = [];
  for (const sentence of sentences) {
    if (!SELF.test(sentence)) continue;
    if (QUESTION.test(sentence)) continue;
    if (SMALL_TALK.test(sentence)) continue;
    if (SECRET.test(sentence)) continue;
    // Links and code snippets are tasks, not facts about the person.
    if (/https?:\/\/|```/.test(sentence)) continue;

    const text = sentence
      .replace(LEADING_WHEN, "")
      .replace(/^[-*•]\s+/, "")
      .slice(0, MAX_LINE)
      .trim();
    if (text.length < 4) continue;
    if (!found.includes(`${date}: ${text}`)) found.push(`${date}: ${text}`);
  }
  return found;
}

/** Parses the stored string into entries (newest first, as stored). */
export function parseMemory(notes: string | null | undefined): MemoryEntry[] {
  return (notes ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d{4}-\d{2}-\d{2}):\s*(.+)$/.exec(line);
      return match ? { date: match[1], text: match[2] } : { date: "", text: line };
    })
    .filter((entry) => entry.text.length > 0);
}

/**
 * Adds new notes to the old ones: newest first, no duplicates (an old note is
 * refreshed instead of repeated), then trimmed to the caps.
 */
export function mergeMemory(existing: string | null | undefined, additions: string[]): string {
  const existingText = (existing ?? "").trim();
  const incoming = additions
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);

  if (incoming.length === 0) return existingText;

  const seen = new Set<string>();
  const lines: string[] = [];

  for (const line of [...incoming].reverse().concat(existingText.split("\n"))) {
    const entry = parseMemory(line)[0];
    if (!entry) continue;
    const key = entry.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(entry.date ? `- ${entry.date}: ${entry.text}` : `- ${entry.text}`);
    if (lines.length >= MEMORY_MAX_LINES) break;
  }

  // Characters cap: drop the oldest notes first.
  let out = lines.join("\n");
  while (out.length > MEMORY_MAX_CHARS && lines.length > 1) {
    lines.pop();
    out = lines.join("\n");
  }
  return out;
}

/** True when the message is worth remembering at all (cheap pre-check). */
export function isWorthRemembering(message: string): boolean {
  if (message.trim().length < 4) return false;
  if (SECRET.test(message)) return false;
  return SELF.test(message) && !QUESTION.test(message.trim());
}

/**
 * The block appended to the system prompt. Empty string when there is nothing
 * remembered, so the prompt stays byte-identical for new users.
 */
export function memorySection(notes: string | null | undefined, today: Date = new Date()): string {
  const entries = parseMemory(notes);
  if (entries.length === 0) return "";

  const list = entries.map((entry) => (entry.date ? `- ${entry.date}: ${entry.text}` : `- ${entry.text}`));

  return [
    "Memory about this person, from earlier sessions (oldest last).",
    `Today is ${isoDay(today)}. The date on each line is the day they said it.`,
    ...list,
    "",
    "How to use it: when the current question connects to a memory, say so naturally and briefly",
    '(for example "you mentioned the gym a few days ago — are you training strength or cardio?"),',
    "then answer for that situation. Use at most one memory per answer, never recite the list,",
    "and never invent a memory that is not written above. If a memory is stale (more than a month",
    "old and about something temporary), ask instead of assuming.",
  ].join("\n");
}

/** Joins the base system prompt with the memory block (no-op when empty). */
export function withMemory(systemPrompt: string, notes: string | null | undefined, today?: Date): string {
  const section = memorySection(notes, today);
  return section ? `${systemPrompt}\n\n${section}` : systemPrompt;
}
