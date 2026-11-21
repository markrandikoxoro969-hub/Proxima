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

async function imageId(ctx: Ctx): Promise<string> {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw apiErrors.notFound("Image");
  return parsed.data;
}

export const GET = withApi(async (_request: Request, ctx: Ctx) => {
  const userId = await requireApiUserId();
  const id = await imageId(ctx);
  // One read: this row already contains the bytes we are about to serve.
  // (It used to be loaded once to prove ownership and again to get the bytes.)
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
  const id = await imageId(ctx);
  // Delete directly: there is no need to read the full bytes (or even the row)
  // just to remove it. `false` means it wasn't this person's picture.
  const removed = await deleteOwnedImage(userId, id);
  if (!removed) throw apiErrors.notFound("Image");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
