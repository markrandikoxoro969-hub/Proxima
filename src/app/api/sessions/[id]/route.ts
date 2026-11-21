import { z } from "zod";
import { apiErrors, json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { getMessagesPage } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { renameSessionSchema } from "@/lib/validation";

/**
 * /api/sessions/:id — one chat session.
 *   GET     the session + messages (oldest → newest). Long chats load in pages:
 *           ?before=<messageId>&limit=50 returns the 50 messages before that one.
 *   PATCH   rename  { title }
 *   DELETE  delete this session and its messages
 *
 * Other people's sessions always answer 404 (we don't reveal that they exist).
 */
type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.cuid();
const pageSchema = z.object({
  before: z.cuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

async function ownedSession(ctx: Ctx, userId: string) {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw apiErrors.notFound("Conversation not found");
  // Fetch the metadata here too: opening a chat used to need three queries
  // (ownership, metadata, messages). Now it needs two.
  const found = await db.conversation.findFirst({
    where: { id: parsed.data, userId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  if (!found) throw apiErrors.notFound("Conversation not found");
  return found;
}

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const userId = await requireApiUserId();
  const session = await ownedSession(ctx, userId);
  const params = new URL(request.url).searchParams;
  const page = pageSchema.parse({
    before: params.get("before") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });

  const { messages, hasMore, nextBefore } = await getMessagesPage(session.id, page);
  return json({ session, messages, hasMore, nextBefore });
});

export const PATCH = withApi(async (request: Request, ctx: Ctx) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  const { id } = await ownedSession(ctx, userId);
  const { title } = renameSessionSchema.parse(await readJson(request));

  const session = await db.conversation.update({
    where: { id },
    data: { title },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return json({ session });
});

export const DELETE = withApi(async (request: Request, ctx: Ctx) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  const { id } = await ownedSession(ctx, userId);
  await db.conversation.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
