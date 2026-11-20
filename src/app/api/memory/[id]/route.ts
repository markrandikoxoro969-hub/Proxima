import { withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { deleteMemory, updateMemory } from "@/lib/memory/store";
import { memoryTextSchema } from "@/lib/validation";

/**
 * PATCH  /api/memory/:id {text} → fix a memory (the person's words, not ours)
 * DELETE /api/memory/:id        → forget this one ("Forget this" in chat)
 */
export const PATCH = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  const { id } = await context.params;
  const { text } = memoryTextSchema.parse(await request.json());
  const memory = await updateMemory(userId, id, text);
  return Response.json({ memory });
});

export const DELETE = withApi(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  const { id } = await context.params;
  const deleted = await deleteMemory(userId, id);
  if (deleted === 0) return Response.json({ deleted: 0 }, { status: 404 });
  return Response.json({ deleted });
});
