import { z } from "zod";
import { apiErrors, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { verifyImageLink } from "@/lib/image/public-url";

/**
 * GET /api/images/:id/source?exp=…&sig=…
 *
 * A temporary, signed read of one picture, used by image engines that fetch the
 * source themselves (Pollinations "kontext"). No login: the signature *is* the
 * permission. Links expire after a few minutes (see public-url.ts) and reveal
 * nothing about the owner.
 *
 * Shared caches are told not to keep it — only the engine and the person's own
 * browser should hold the bytes, and the query changes on every request.
 */
type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.cuid();

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw apiErrors.notFound("Image");

  const url = new URL(request.url);
  const expiresAt = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";
  if (!verifyImageLink(parsed.data, expiresAt, signature)) throw apiErrors.notFound("Image");

  const row = await db.imageAsset.findUnique({
    where: { id: parsed.data },
    select: { bytes: true, mime: true },
  });
  if (!row) throw apiErrors.notFound("Image");

  const bytes = new Uint8Array(row.bytes.length);
  bytes.set(row.bytes);
  const secondsLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": `private, max-age=${Math.min(secondsLeft, 600)}`,
      "X-Content-Type-Options": "nosniff",
      // SVG previews can do nothing even when opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
});
