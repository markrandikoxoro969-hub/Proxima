import { z } from "zod";
import { apiErrors, json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
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

async function ownedSessionId(ctx: Ctx, userId: string): Promise<string> {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw apiErrors.notFound("Conversation not found");
  const found = await db.conversation.findFirst({ where: { id: parsed.data, userId }, select: { id: true } });
  if (!found) throw apiErrors.notFound("Conversation not found");
  return found.id;
}

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const userId = await requireApiUserId();
  const id = await ownedSessionId(ctx, userId);
  const params = new URL(request.url).searchParams;
  const page = pageSchema.parse({
    before: params.get("before") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });

  const session = await db.conversation.findUniqueOrThrow({
    where: { id },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  // Newest first from the DB (fast with our index), then flipped for display.
  const rows = await db.message.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
    ...(page.before ? { cursor: { id: page.before }, skip: 1 } : {}),
    select: { id: true, role: true, content: true, attachments: true, latencyMs: true, createdAt: true },
  });
  const hasMore = rows.length > page.limit;
  const messages = rows.slice(0, page.limit).reverse();

  return json({ session, messages, hasMore, nextBefore: hasMore ? messages[0]?.id : null });
});

export const PATCH = withApi(async (request: Request, ctx: Ctx) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  const id = await ownedSessionId(ctx, userId);
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
  const id = await ownedSessionId(ctx, userId);
  await db.conversation.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
