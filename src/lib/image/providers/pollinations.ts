import "server-only";
import { sniffImageMime } from "../data-url";
import { pollinationsUrl } from "../settings";
import { readImageSize } from "../size";
import {
  ImageProviderError,
  type GeneratedImage,
  type ImageEditRequest,
  type ImageGenerationRequest,
  type ImageProvider,
} from "../types";

/**
 * Pollinations — a free, keyless image service. It is the default so the
 * studio works the moment you deploy, without buying anything.
 *
 *   GET https://image.pollinations.ai/prompt/<prompt>?width=…&height=…&nologo=true
 *   + &image=<public url> makes it an image-to-image edit.
 *
 * Editing needs the source picture to be reachable from the internet, so the
 * route passes our own image URL (NEXT_PUBLIC_SITE_URL + /api/images/<id>).
 * On localhost that isn't possible — the studio then uses another engine.
 */
export type PollinationsOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function createPollinationsImageProvider(options: PollinationsOptions = {}): ImageProvider {
  const baseUrl = options.baseUrl ?? pollinationsUrl();
  const doFetch = options.fetchImpl ?? fetch;

  const request = async (url: string, requestSignal: AbortSignal): Promise<GeneratedImage> => {
    let response: Response;
    try {
      response = await doFetch(url, {
        signal: requestSignal,
        cache: "no-store",
        headers: { Accept: "image/*" },
      });
    } catch (error) {
      if (requestSignal.aborted) {
        const reason = requestSignal.reason as { name?: string } | undefined;
        throw reason?.name === "TimeoutError"
          ? new ImageProviderError("Image service timed out", "timeout")
          : new ImageProviderError("Request was cancelled", "aborted");
      }
      throw new ImageProviderError(
        `Image service unreachable: ${(error as Error)?.message ?? "unknown error"}`,
        "unavailable",
      );
    }

    if (!response.ok) {
      throw new ImageProviderError(
        `Image service responded with HTTP ${response.status}`,
        "upstream",
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

  const params = (width: number, height: number) =>
    new URLSearchParams({
      width: String(Math.round(width)),
      height: String(Math.round(height)),
      nologo: "true",
      private: "true",
      seed: String(Math.floor(Math.random() * 1_000_000)),
      model: "flux",
    });

  return {
    id: "pollinations",
    label: "Pollinations (free)",
    supportsEdit: true,

    async generate({ prompt, width, height, signal }: ImageGenerationRequest) {
      return request(`${baseUrl}/${encodeURIComponent(prompt)}?${params(width, height)}`, signal);
    },

    async edit({ prompt, width, height, sourceUrl, signal }: ImageEditRequest) {
      if (!sourceUrl) {
        throw new ImageProviderError(
          "Editing a picture needs a public image address (set NEXT_PUBLIC_SITE_URL).",
          "unsupported",
        );
      }
      const search = new URLSearchParams({
        width: String(Math.round(width)),
        height: String(Math.round(height)),
        nologo: "true",
        private: "true",
        seed: String(Math.floor(Math.random() * 1_000_000)),
        model: "kontext",
        image: sourceUrl,
      });
      return request(`${baseUrl}/${encodeURIComponent(prompt)}?${search}`, signal);
    },
  };
}
