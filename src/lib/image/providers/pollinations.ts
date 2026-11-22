import "server-only";
import { decodeBase64, sniffImageMime } from "../data-url";
import { IMAGE_LIMITS } from "../limits";
import { pollinationsImageKey, pollinationsImageModel, pollinationsEditModel } from "../settings";
import { readImageSize } from "../size";
import { ImageProviderError, type GeneratedImage, type ImageProvider } from "../types";

/** Pollinations' OpenAI-compatible generation and multipart image editing API. */
export type PollinationsImageOptions = {
  apiKey?: string;
  model?: string;
  editModel?: string;
  /** Inject a fetch implementation in tests; the production endpoint is fixed. */
  fetchImpl?: typeof fetch;
};

export function createPollinationsImageProvider(options: PollinationsImageOptions = {}): ImageProvider {
  const apiKey = options.apiKey ?? pollinationsImageKey();
  const model = options.model ?? pollinationsImageModel();
  const editModel = options.editModel ?? pollinationsEditModel();
  const doFetch = options.fetchImpl ?? fetch;

  async function invoke(
    path: "generations" | "edits",
    body: BodyInit,
    signal: AbortSignal,
    json = false,
  ): Promise<GeneratedImage> {
    if (!apiKey) throw new ImageProviderError("POLLINATIONS_API_KEY is not set", "unavailable");
    try {
      const response = await doFetch(`https://gen.pollinations.ai/v1/images/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(json ? { "Content-Type": "application/json" } : {}),
        },
        body,
        signal,
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok)
        throw new ImageProviderError(
          `Pollinations responded with HTTP ${response.status}`,
          "upstream",
          response.status,
        );
      const payload = (await response.json()) as { data?: { b64_json?: unknown }[] };
      const base64 = payload?.data?.[0]?.b64_json;
      if (
        typeof base64 !== "string" ||
        !base64 ||
        base64.length > IMAGE_LIMITS.dataUrlMax ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
      ) {
        throw new ImageProviderError("Pollinations returned an invalid image", "bad_response");
      }
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(base64);
      } catch {
        throw new ImageProviderError("Pollinations returned an invalid image", "bad_response");
      }
      const mime = sniffImageMime(bytes);
      const size = readImageSize(bytes);
      if (!mime || mime === "image/svg+xml" || !size || bytes.length > IMAGE_LIMITS.storedBytesMax) {
        throw new ImageProviderError("Pollinations returned an invalid image", "bad_response");
      }
      return { bytes, mime, ...size };
    } catch (error) {
      if (signal.aborted) {
        const reason = signal.reason as { name?: string } | undefined;
        throw reason?.name === "TimeoutError"
          ? new ImageProviderError("Pollinations request timed out", "timeout")
          : new ImageProviderError("Request was cancelled", "aborted");
      }
      if (error instanceof ImageProviderError) throw error;
      if (error instanceof SyntaxError)
        throw new ImageProviderError("Pollinations returned invalid JSON", "bad_response");
      // Never include network error details: these may contain request URLs or credentials.
      throw new ImageProviderError("Pollinations request failed", "unavailable");
    }
  }

  return {
    id: "pollinations",
    label: "Pollinations",
    supportsEdit: Boolean(apiKey),
    generate: (request) =>
      invoke(
        "generations",
        JSON.stringify({
          model,
          prompt: request.prompt,
          size: `${request.width}x${request.height}`,
          n: 1,
          response_format: "b64_json",
        }),
        request.signal,
        true,
      ),
    edit: (request) => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(request.image.mime)) {
        throw new ImageProviderError(
          "Pollinations edits require a PNG, JPEG, or WebP source",
          "unsupported_source",
        );
      }
      const form = new FormData();
      const file = new Blob([new Uint8Array(request.image.bytes)], { type: request.image.mime });
      const extension =
        request.image.mime === "image/jpeg" ? "jpg" : request.image.mime === "image/webp" ? "webp" : "png";
      form.set("image", file, `source.${extension}`);
      form.set("model", editModel);
      form.set("prompt", request.prompt);
      // Uploads can be tiny or oddly sized. Scale to the default edit model's
      // supported range and multiples of 16 while retaining the aspect ratio.
      const scale = Math.min(
        1536 / Math.max(request.width, request.height),
        Math.max(1, 256 / Math.min(request.width, request.height)),
      );
      const side = (value: number) => Math.max(256, Math.min(1536, Math.round((value * scale) / 16) * 16));
      form.set("size", `${side(request.width)}x${side(request.height)}`);
      form.set("n", "1");
      form.set("response_format", "b64_json");
      return invoke("edits", form, request.signal);
    },
  };
}
