import { z } from "zod";
import { json, readJson, withApi, apiErrors } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { getImageProvider, imageEngineInfo, imageTimeoutMs, resolveImageSettings } from "@/lib/image";
import { encodeBase64, toImageDataUrl } from "@/lib/image/data-url";
import { ImageProviderError } from "@/lib/image/types";
import { imageApiError } from "@/lib/image/errors";
import { buildImagePrompt } from "@/lib/image/limits";
import { loadOwnedImage, saveImage } from "@/lib/image/store";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { signedImageUrl } from "@/lib/image/public-url";
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
      // Expiring signed link: engines that fetch the picture themselves can read
      // it without a login, even though /api/images/:id stays owner-only.
      sourceUrl: signedImageUrl(source.id, request),
      signal,
    });
  } catch (error) {
    throw imageApiError(error);
  }

  // An "edit" that comes back as the offline preview isn't an edit: the card
  // just restates the prompt. Say so, instead of storing something misleading.
  if (picture.mime === "image/svg+xml" && resolveImageSettings().id !== "mock") {
    throw imageApiError(
      new ImageProviderError(
        "No AI engine could change the picture (only the offline preview answered)",
        "unsupported",
      ),
    );
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
    engine: imageEngineInfo(provider),
    offline: picture.mime === "image/svg+xml",
  });
});
