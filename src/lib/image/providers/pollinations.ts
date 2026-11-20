import "server-only";
import { sniffImageMime } from "../data-url";
import {
  pollinationsApiKey,
  pollinationsEditModel,
  pollinationsImageModel,
  pollinationsUrl,
} from "../settings";
import { readImageSize } from "../size";
import {
  ImageProviderError,
  type GeneratedImage,
  type ImageEditRequest,
  type ImageGenerationRequest,
  type ImageProvider,
} from "../types";

/**
 * Pollinations — the free image service that makes the studio work out of the
 * box, with no account and no card.
 *
 *   keyless   GET https://image.pollinations.ai/prompt/<prompt>?width=…&nologo=true
 *   keyed     GET https://gen.pollinations.ai/image/<prompt>?…   (+ Bearer key)
 *
 * Why two endpoints:
 *
 *   `nologo=true` (no watermark) and image-to-image editing are only honoured
 *   on the keyed endpoint. The anonymous legacy endpoint always brands the
 *   picture and throttles to roughly one request every 15 seconds, so it is the
 *   "works right now" tier, not the "production" tier. Drop a free key from
 *   enter.pollinations.ai into POLLINATIONS_API_KEY and both improve with no
 *   other change.
 *
 * Editing ("kontext") takes the source picture as a URL, not as bytes, so the
 * caller passes an expiring signed link (see public-url.ts). That is why
 * editing also works for pictures that are otherwise owner-only.
 */
export type PollinationsOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  editModel?: string;
  fetchImpl?: typeof fetch;
};

export function createPollinationsImageProvider(options: PollinationsOptions = {}): ImageProvider {
  const baseUrl = (options.baseUrl ?? pollinationsUrl()).replace(/\/+$/, "");
  const apiKey = (options.apiKey ?? pollinationsApiKey()).trim();
  const model = (options.model ?? pollinationsImageModel()).trim();
  const editModel = (options.editModel ?? pollinationsEditModel()).trim();
  const doFetch = options.fetchImpl ?? fetch;

  const request = async (url: string, requestSignal: AbortSignal): Promise<GeneratedImage> => {
    let response: Response;
    try {
      response = await doFetch(url, {
        signal: requestSignal,
        cache: "no-store",
        headers: {
          Accept: "image/*",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });
    } catch (error) {
      if (requestSignal.aborted) {
        const reason = requestSignal.reason as { name?: string } | undefined;
        throw new ImageProviderError(
          "Image service timed out",
          reason?.name === "TimeoutError" ? "timeout" : "aborted",
        );
      }
      throw new ImageProviderError(
        `Image service unreachable: ${(error as Error)?.message ?? "unknown error"}`,
        "unavailable",
      );
    }

    if (!response.ok) {
      // 401/402 mean "this needs a key or credits", not "the service broke".
      const needsKey = response.status === 401 || response.status === 402 || response.status === 403;
      throw new ImageProviderError(
        needsKey
          ? "The image service refused the request (key or credits needed)"
          : `Image service responded with HTTP ${response.status}`,
        needsKey ? "unsupported" : "upstream",
        response.status,
      );
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      throw new ImageProviderError("Image service did not send a picture", "bad_response");
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0)
      throw new ImageProviderError("Image service sent an empty picture", "bad_response");
    const mime = sniffImageMime(bytes);
    if (!mime || mime === "image/svg+xml") {
      throw new ImageProviderError("Image service sent an unsupported picture", "bad_response");
    }
    const size = readImageSize(bytes) ?? { width: 1024, height: 1024 };
    return { bytes, mime, ...size };
  };

  const common = (width: number, height: number) =>
    new URLSearchParams({
      width: String(Math.round(width)),
      height: String(Math.round(height)),
      // Ask for a clean picture every time; the keyed endpoint honours it.
      nologo: "true",
      // Keep it out of the public feed.
      private: "true",
      seed: String(Math.floor(Math.random() * 1_000_000)),
    });

  return {
    id: "pollinations",
    label: apiKey ? "Pollinations" : "Pollinations (free)",
    supportsEdit: true,

    async generate({ prompt, width, height, signal }: ImageGenerationRequest) {
      const params = common(width, height);
      params.set("model", model);
      return request(`${baseUrl}/${encodeURIComponent(prompt)}?${params}`, signal);
    },

    async edit({ prompt, width, height, sourceUrl, signal }: ImageEditRequest) {
      if (!sourceUrl) {
        throw new ImageProviderError(
          "Editing needs a public address for the picture. Set NEXT_PUBLIC_SITE_URL to your live site address (docs/IMAGES.md).",
          "unsupported",
        );
      }
      const params = common(width, height);
      params.set("model", editModel);
      params.set("image", sourceUrl);
      return request(`${baseUrl}/${encodeURIComponent(prompt)}?${params}`, signal);
    },
  };
}
