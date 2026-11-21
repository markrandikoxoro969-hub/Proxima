import { apiErrors, json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { parseImageDataUrl, ImageDataError } from "@/lib/image/data-url";
import { IMAGE_LIMITS } from "@/lib/image/limits";
import { readImageSize } from "@/lib/image/size";
import { getImageProvider, imageEngineInfo } from "@/lib/image";
import { listImages, saveImage } from "@/lib/image/store";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { imageUploadSchema } from "@/lib/validation";

/**
 * /api/images — the person's pictures.
 *
 *   GET   → the newest images (the studio's "recent" strip)
 *   POST  → upload one picture { dataUrl, name? } → { image }
 *
 * Pictures are shrunk in the browser before they get here (see
 * src/lib/image/client/encode.ts), so a normal request is ~100–400 KB.
 * Requests larger than 4 MB are refused; the check is on the decoded bytes,
 * not on what the browser claims.
 */
export const maxDuration = 60;

export const GET = withApi(async () => {
  const userId = await requireApiUserId();
  // `engine` tells the studio which engine (and honest note) is in use.
  return json({ images: await listImages(userId), engine: imageEngineInfo(getImageProvider()) });
});

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);

  const input = imageUploadSchema.parse(await readJson(request, IMAGE_LIMITS.dataUrlMax + 1024));

  let parsed;
  try {
    // Uploads from people: PNG / JPEG / WebP only. SVG could run scripts, so no.
    parsed = parseImageDataUrl(input.dataUrl, { maxBytes: IMAGE_LIMITS.storedBytesMax });
  } catch (error) {
    if (error instanceof ImageDataError) throw apiErrors.badRequest(error.message);
    throw error;
  }

  const size = readImageSize(parsed.bytes);
  if (!size) {
    throw apiErrors.badRequest(
      "We couldn't read that picture. Try saving it as PNG or JPEG and upload again.",
    );
  }

  const image = await saveImage({
    userId,
    bytes: parsed.bytes,
    mime: parsed.mime,
    width: size.width,
    height: size.height,
    source: "upload",
  });
  return json({ image }, { status: 201 });
});
