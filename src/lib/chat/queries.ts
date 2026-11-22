import "server-only";
import { db } from "@/lib/db";
import type { AttachmentMeta, ChatMessageDTO, MessagesPage, SessionSummary } from "./types";

/**
 * Database reads shared by the API routes and the /app page, so the
 * sidebar and chat look the same whether they came from the server render
 * or from a later fetch.
 */
export const SESSIONS_PAGE_SIZE = 50;
export const MESSAGES_PAGE_SIZE = 100;

export async function listSessions(
  userId: string,
  cursor?: string | null,
): Promise<{ sessions: SessionSummary[]; nextCursor: string | null }> {
  const rows = await db.conversation.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: SESSIONS_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  const hasMore = rows.length > SESSIONS_PAGE_SIZE;
  const sessions = rows.slice(0, SESSIONS_PAGE_SIZE).map((s) => ({
    id: s.id,
    title: s.title,
    messageCount: s._count.messages,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
  return { sessions, nextCursor: hasMore ? (sessions.at(-1)?.id ?? null) : null };
}

/** Newest `limit` messages (or the ones before `before`), returned oldest → newest. */
export async function getMessagesPage(
  conversationId: string,
  { before, limit = MESSAGES_PAGE_SIZE }: { before?: string; limit?: number } = {},
): Promise<MessagesPage> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true,
      role: true,
      content: true,
      attachments: true,
      latencyMs: true,
      generationProgress: true,
      createdAt: true,
    },
  });
  const hasMore = rows.length > limit;
  const messages: ChatMessageDTO[] = rows
    .slice(0, limit)
    .reverse()
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachments: Array.isArray(m.attachments) ? (m.attachments as AttachmentMeta[]) : null,
      latencyMs: m.latencyMs,
      complete: m.generationProgress === null,
      createdAt: m.createdAt.toISOString(),
    }));
  return { messages, hasMore, nextBefore: hasMore ? (messages[0]?.id ?? null) : null };
}
