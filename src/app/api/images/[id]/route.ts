import { z } from "zod";
import { apiErrors, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { deleteOwnedImage, loadOwnedImage } from "@/lib/image/store";

/**
 * /api/images/:id — one picture.
 *
 *   GET     the bytes (used by <img src> in the chat and the studio)
 *   DELETE  remove it from the account
 *
 * Only the owner can read it: someone else's id answers 404, exactly like an
 * id that doesn't exist.
 */
type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.cuid();

async function ownedId(ctx: Ctx, userId: string): Promise<string> {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw apiErrors.notFound("Image");
  const row = await loadOwnedImage(userId, parsed.data);
  if (!row) throw apiErrors.notFound("Image");
  return row.id;
}

export const GET = withApi(async (_request: Request, ctx: Ctx) => {
  const userId = await requireApiUserId();
  const id = await ownedId(ctx, userId);
  const row = await loadOwnedImage(userId, id);
  if (!row) throw apiErrors.notFound("Image");

  const bytes = new Uint8Array(row.bytes.length);
  bytes.set(row.bytes);

  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.length),
      // The bytes for an id never change, and only the owner can ask for them.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Belt and braces for SVG previews: even in a tab of its own they can do nothing.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

export const DELETE = withApi(async (request: Request, ctx: Ctx) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  const id = await ownedId(ctx, userId);
  await deleteOwnedImage(userId, id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
