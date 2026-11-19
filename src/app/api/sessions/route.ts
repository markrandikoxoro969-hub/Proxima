import { apiErrors, json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { DEFAULT_TITLE } from "@/lib/chat/compose";
import { listSessions } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/validation";

/**
 * /api/sessions — your chat sessions (sidebar).
 *   GET     list, newest first   (?cursor=<id> for the next page)
 *   POST    create  { title? }
 *   DELETE  clear ALL your history (?confirm=all) — only YOUR chats, nothing else
 */
export const GET = withApi(async (request: Request) => {
  const userId = await requireApiUserId();
  const cursor = new URL(request.url).searchParams.get("cursor");
  return json(await listSessions(userId, cursor));
});

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  const input = createSessionSchema.parse(await readJson(request).catch(() => ({})));

  const session = await db.conversation.create({
    data: { userId, title: input.title ?? DEFAULT_TITLE },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return json({ session: { ...session, messageCount: 0 } }, { status: 201 });
});

export const DELETE = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  if (new URL(request.url).searchParams.get("confirm") !== "all") {
    throw apiErrors.badRequest("Add ?confirm=all to delete all of your chat history.");
  }
  const { count } = await db.conversation.deleteMany({ where: { userId } });
  return json({ deleted: count });
});
