import "server-only";
import { apiErrors } from "@/lib/api/http";
import { db } from "@/lib/db";
import { expandMemoryTerms, extractMemories, isWorthRemembering, memoryBlock, memoryKey } from "./extract";

/**
 * Database side of memory: consent, relevance, saving, editing, deleting.
 *
 * Every read of `User.memoryEnabled` happens on the server, so the browser can
 * never switch memory on by itself — the switch is an authenticated API call.
 */

export type MemoryRow = {
  id: string;
  text: string;
  category: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
};

/** Words that carry no meaning for matching. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for", "with", "my", "me", "i",
  "is", "are", "am", "was", "were", "be", "been", "do", "does", "did", "what", "which", "who", "how",
  "why", "when", "where", "can", "could", "should", "would", "you", "your", "it", "this", "that",
  "good", "best", "any", "some", "about", "get", "got", "have", "has", "need", "want", "please",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

/** Memory is on, and it was switched on by the person. */
export async function memoryEnabled(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { memoryEnabled: true } });
  return Boolean(user?.memoryEnabled);
}

/** Turns memory on (recording consent) or off. Turning it off keeps the rows. */
export async function setMemoryEnabled(userId: string, enabled: boolean) {
  return db.user.update({
    where: { id: userId },
    data: {
      memoryEnabled: enabled,
      ...(enabled ? { memoryConsentAt: new Date() } : {}),
    },
    select: { memoryEnabled: true, memoryConsentAt: true },
  });
}

/** Everything stored for this person, newest first (expired rows are dropped). */
export async function listMemories(userId: string): Promise<MemoryRow[]> {
  await db.userMemory.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  return db.userMemory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, text: true, category: true, createdAt: true, expiresAt: true, lastUsedAt: true },
  });
}

/**
 * The few memories worth putting in the system prompt for this message.
 *
 * Keyword matching for now (the schema is ready for pgvector later): each shared
 * meaningful word scores a point, an exact phrase scores three, and ties go to
 * the memory that was used least recently. Only matches are returned, so an
 * unrelated question gets an empty list and an untouched prompt.
 */
export async function relevantMemories(
  userId: string,
  message: string,
  limit = 4,
): Promise<MemoryRow[]> {
  const query = expandMemoryTerms(tokens(message));
  if (query.length === 0) return [];

  const rows = await db.userMemory.findMany({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, text: true, category: true, createdAt: true, expiresAt: true, lastUsedAt: true },
  });
  if (rows.length === 0) return [];

  const phrase = message.toLowerCase();
  const scored = rows
    .map((row) => {
      const rowTokens = new Set(tokens(row.text));
      let score = query.reduce((total, word) => total + (rowTokens.has(word) ? 1 : 0), 0);
      if (score > 0 && phrase.includes(row.text.toLowerCase())) score += 3;
      return { row, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const usedA = a.row.lastUsedAt?.getTime() ?? 0;
      const usedB = b.row.lastUsedAt?.getTime() ?? 0;
      if (usedA !== usedB) return usedA - usedB;
      return b.row.createdAt.getTime() - a.row.createdAt.getTime();
    })
    .slice(0, limit);

  const picked = scored.map((entry) => entry.row);

  if (picked.length > 0) {
    // Best-effort: usage timestamps help prefer fresh memories next time.
    void db.userMemory
      .updateMany({ where: { id: { in: picked.map((row) => row.id) } }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  return picked;
}

/** The system-prompt section for these memories ("" when there are none). */
export function memoryPrompt(memories: MemoryRow[], today: Date = new Date()): string {
  return memoryBlock(memories.map((memory) => ({ text: memory.text, category: memory.category })), today);
}

/**
 * Learns from one user message. Deterministic and local (no AI call, no network),
 * so it costs microseconds and can never delay the reply; still wrapped so a
 * database hiccup cannot fail a chat.
 */
export async function rememberMessage(
  userId: string,
  message: string,
  sourceSessionId?: string | null,
): Promise<number> {
  if (!isWorthRemembering(message)) return 0;
  const found = extractMemories(message);
  if (found.length === 0) return 0;

  try {
    // Free a unique key once its old time-bound row has expired, so a new
    // occurrence of the same fact can be learned again.
    await db.userMemory.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    const result = await db.userMemory.createMany({
      data: found.map((memory) => ({
        userId,
        text: memory.text,
        category: memory.category,
        key: memoryKey(memory.text),
        sourceSessionId: sourceSessionId ?? null,
        expiresAt: memory.expiresAt,
      })),
      skipDuplicates: true, // the (userId, key) unique index merges duplicates
    });
    return result.count;
  } catch {
    return 0;
  }
}

export async function updateMemory(userId: string, id: string, text: string) {
  const key = memoryKey(text);
  return db.$transaction(async (tx) => {
    const current = await tx.userMemory.findFirst({ where: { id, userId }, select: { id: true } });
    if (!current) throw apiErrors.notFound("Memory not found");

    // Editing a note to match another note merges the duplicate instead of
    // surfacing a database uniqueness error or leaving two copies behind.
    await tx.userMemory.deleteMany({ where: { userId, key, id: { not: id } } });
    return tx.userMemory.update({
      where: { id, userId },
      data: { text, key },
      select: { id: true, text: true, category: true },
    });
  });
}

export async function deleteMemory(userId: string, id: string): Promise<number> {
  const result = await db.userMemory.deleteMany({ where: { id, userId } });
  return result.count;
}

export async function deleteAllMemories(userId: string): Promise<number> {
  const result = await db.userMemory.deleteMany({ where: { userId } });
  return result.count;
}
