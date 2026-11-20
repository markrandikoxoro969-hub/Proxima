import { getImageProvider, imageTimeoutMs } from "@/lib/image";
import { imageApiError } from "@/lib/image/errors";
import { IMAGE_LIMITS, buildImagePrompt } from "@/lib/image/limits";
import { saveImage } from "@/lib/image/store";
import { json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { imageGenerateSchema } from "@/lib/validation";

/**
 * POST /api/images/generate — "draw me a …"
 *
 * Signed in only: every picture costs an API call and uses storage.
 * Body: { prompt, width?, height?, style? } → { image, engine, offline }
 *
 * `offline: true` means the answer came from the built-in preview (no key
 * configured), so the studio can say so instead of pretending it's real art.
 */
export const maxDuration = 120;

const DEFAULT_EDGE = 1024;

const edge = (value: number | undefined) =>
  Math.min(IMAGE_LIMITS.generatedEdgeMax, Math.max(256, Math.round(value ?? DEFAULT_EDGE)));

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(
    `image:user:${userId}`,
    RATE_LIMITS.image,
    "You're creating pictures quickly — please wait a moment (limit: 6 per minute).",
  );

  const input = imageGenerateSchema.parse(await readJson(request, 32 * 1024));
  const width = edge(input.width);
  const height = edge(input.height);
  const prompt = buildImagePrompt(input.prompt, input.style);

  const timeout = AbortSignal.timeout(imageTimeoutMs());
  const signal = AbortSignal.any([request.signal, timeout]);

  const provider = getImageProvider();
  let picture;
  try {
    picture = await provider.generate({ prompt, width, height, signal });
  } catch (error) {
    throw imageApiError(error);
  }

  const image = await saveImage({
    userId,
    bytes: picture.bytes,
    mime: picture.mime,
    width: picture.width,
    height: picture.height,
    source: "generated",
    prompt,
  });

  return json({
    image,
    engine: { id: provider.id, label: provider.label },
    offline: picture.mime === "image/svg+xml",
  });
});
