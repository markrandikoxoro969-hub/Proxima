import { withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { clearMemory, readMemory } from "@/lib/ai/memory-store";
import { db } from "@/lib/db";

/**
 * GET    /api/memory — what PROXIMA remembers about you (Settings → Memory).
 * DELETE /api/memory — forget everything, permanently.
 *
 * Memory is per account and tiny (max 24 short lines); it is written by
 * src/lib/ai/memory-store.ts while you chat, never by the browser.
 */
export const GET = withApi(async () => {
  const userId = await requireApiUserId();
  const [notes, user] = await Promise.all([
    readMemory(userId),
    db.user.findUnique({ where: { id: userId }, select: { memoryUpdatedAt: true } }),
  ]);
  return Response.json({ notes, updatedAt: user?.memoryUpdatedAt ?? null });
});

export const DELETE = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await clearMemory(userId);
  return Response.json({ cleared: true });
});
