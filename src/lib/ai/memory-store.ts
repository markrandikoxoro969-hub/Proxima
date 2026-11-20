import "server-only";
import { db } from "@/lib/db";
import { extractMemories, isWorthRemembering, mergeMemory } from "./memory";

/**
 * Database side of the memory feature (see ./memory.ts for the rules).
 *
 * Everything here is best-effort: if the database hiccups, the chat still
 * answers — it just answers without the extra context.
 */

/** The notes stored for this person, or null. */
export async function readMemory(userId: string): Promise<string | null> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { memoryNotes: true } });
    return user?.memoryNotes?.trim() ? user.memoryNotes : null;
  } catch {
    return null;
  }
}

/**
 * Reads the notes, learns from the new message, saves, and returns what should
 * go into the system prompt. One read and (only when something new appeared)
 * one small write — no extra AI call, so a reply never waits on it.
 */
export async function readMemoryAndLearn(userId: string, message: string): Promise<string | null> {
  const existing = await readMemory(userId);
  if (!isWorthRemembering(message)) return existing;

  const additions = extractMemories(message);
  if (additions.length === 0) return existing;

  const next = mergeMemory(existing, additions);
  if (next === (existing ?? "")) return existing;

  try {
    await db.user.update({
      where: { id: userId },
      data: { memoryNotes: next, memoryUpdatedAt: new Date() },
    });
  } catch {
    // A failed memory write must never fail the chat.
    return existing;
  }
  return next;
}

/** Deletes everything PROXIMA remembers ("Settings → Memory → Forget all"). */
export async function clearMemory(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { memoryNotes: null, memoryUpdatedAt: new Date() },
  });
}
