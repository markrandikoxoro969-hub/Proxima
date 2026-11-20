import "server-only";
import OpenAI, { toFile } from "openai";
import { decodeBase64, sniffImageMime } from "../data-url";
import { openaiImageModel } from "../settings";
import { readImageSize } from "../size";
import {
  ImageProviderError,
  type GeneratedImage,
  type ImageGenerationRequest,
  type ImageEditRequest,
  type ImageProvider,
} from "../types";

/**
 * OpenAI Images — the best quality option, and the only one here that can edit.
 *
 *   gpt-image-1  →  POST /v1/images/generations  and  POST /v1/images/edits
 *
 * The key comes from OPENAI_API_KEY on the server and is never sent anywhere
 * else. Sizes are snapped to the three shapes the API supports.
 */
type OpenAiSize = "1024x1024" | "1536x1024" | "1024x1536";

export function openAiSizeFor(width: number, height: number): OpenAiSize {
  const ratio = width / Math.max(1, height);
  if (ratio >= 1.2) return "1536x1024";
  if (ratio <= 0.83) return "1024x1536";
  return "1024x1024";
}

export type OpenAiImageOptions = {
  /** Injected in tests so no network call is made. */
  client?: OpenAI;
  apiKey?: string;
  model?: string;
};

export function createOpenAiImageProvider(options: OpenAiImageOptions = {}): ImageProvider {
  const model = options.model ?? openaiImageModel();
  const apiKey = options.apiKey ?? (process.env.OPENAI_API_KEY ?? "").trim();

  let client = options.client;
  const getClient = () => {
    if (!client) {
      if (!apiKey) throw new ImageProviderError("OPENAI_API_KEY is not set", "unavailable");
      client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 0 });
    }
    return client;
  };

  const decode = (base64: string | undefined, width: number, height: number): GeneratedImage => {
    if (!base64) throw new ImageProviderError("OpenAI returned no image", "bad_response");
    const bytes = decodeBase64(base64);
    const size = readImageSize(bytes) ?? { width, height };
    return { bytes, mime: sniffImageMime(bytes) ?? "image/png", ...size };
  };

  return {
    id: "openai",
    label: `OpenAI ${model}`,
    supportsEdit: true,

    async generate(request: ImageGenerationRequest) {
      try {
        const response = await getClient().images.generate(
          {
            model,
            prompt: request.prompt,
            size: openAiSizeFor(request.width, request.height),
            n: 1,
          },
          { signal: request.signal },
        );
        return decode(response.data?.[0]?.b64_json ?? undefined, request.width, request.height);
      } catch (error) {
        throw toImageError(error, request.signal);
      }
    },

    async edit(request: ImageEditRequest) {
      try {
        const file = await toFile(request.image.bytes, "source.png", { type: request.image.mime });
        const response = await getClient().images.edit(
          {
            model,
            image: file,
            prompt: request.prompt,
            size: openAiSizeFor(request.width, request.height),
            n: 1,
          },
          { signal: request.signal },
        );
        return decode(response.data?.[0]?.b64_json ?? undefined, request.width, request.height);
      } catch (error) {
        throw toImageError(error, request.signal);
      }
    },
  };
}

/** Turns SDK/network failures into the small set of codes the studio understands. */
function toImageError(error: unknown, signal: AbortSignal): ImageProviderError {
  if (signal.aborted) {
    const reason = signal.reason as { name?: string } | undefined;
    return reason?.name === "TimeoutError"
      ? new ImageProviderError("OpenAI request timed out", "timeout")
      : new ImageProviderError("Request was cancelled", "aborted");
  }
  const status = (error as { status?: number })?.status;
  if (typeof status === "number") {
    return new ImageProviderError(`OpenAI responded with HTTP ${status}`, "upstream", status);
  }
  if ((error as { name?: string })?.name === "APIConnectionTimeoutError") {
    return new ImageProviderError("OpenAI request timed out", "timeout");
  }
  return new ImageProviderError(
    `OpenAI request failed: ${(error as Error)?.message ?? "unknown error"}`,
    "unavailable",
  );
}
