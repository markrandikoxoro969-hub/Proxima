import { z } from "zod";
import { json, readJson, withApi, apiErrors } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { getImageProvider, imageTimeoutMs } from "@/lib/image";
import { encodeBase64, toImageDataUrl } from "@/lib/image/data-url";
import { ImageProviderError } from "@/lib/image/types";
import { imageApiError, publicImageUrl } from "@/lib/image/errors";
import { buildImagePrompt } from "@/lib/image/limits";
import { loadOwnedImage, saveImage } from "@/lib/image/store";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { imageEditSchema } from "@/lib/validation";

/**
 * POST /api/images/:id/edit — "keep this picture, but change …"
 *
 * Body: { prompt, strength? } → { image, engine, offline }
 * The new picture is stored next to the original (parentId) so the studio can
 * show "original ⇄ edited" and keep editing without losing anything.
 */
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.cuid();

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(
    `image:user:${userId}`,
    RATE_LIMITS.image,
    "You're editing pictures quickly — please wait a moment (limit: 6 per minute).",
  );

  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw apiErrors.notFound("Image");
  const source = await loadOwnedImage(userId, parsed.data);
  if (!source) throw apiErrors.notFound("Image");

  const input = imageEditSchema.parse(await readJson(request, 32 * 1024));
  const prompt = buildImagePrompt(input.prompt);
  const bytes = new Uint8Array(source.bytes);

  const timeout = AbortSignal.timeout(imageTimeoutMs());
  const signal = AbortSignal.any([request.signal, timeout]);

  const provider = getImageProvider();
  if (!provider.edit) {
    throw imageApiError(
      new ImageProviderError("No configured image engine can edit pictures", "unsupported"),
    );
  }
  let picture;
  try {
    picture = await provider.edit({
      prompt,
      width: source.width,
      height: source.height,
      image: { bytes, mime: source.mime, dataUrl: toImageDataUrl(source.mime, encodeBase64(bytes)) },
      strength: input.strength ?? 0.55,
      sourceUrl: publicImageUrl(source.id),
      signal,
    });
  } catch (error) {
    throw imageApiError(error);
  }

  const image = await saveImage({
    userId,
    bytes: picture.bytes,
    mime: picture.mime,
    width: picture.width,
    height: picture.height,
    source: "edited",
    prompt,
    parentId: source.id,
  });

  return json({
    image,
    original: source.id,
    engine: { id: provider.id, label: provider.label },
    offline: picture.mime === "image/svg+xml",
  });
});
