import "server-only";
import { decodeBase64, sniffImageMime } from "../data-url";
import { nvidiaImageBaseUrl, nvidiaImageModel } from "../settings";
import { readImageSize } from "../size";
import {
  ImageProviderError,
  type GeneratedImage,
  type ImageGenerationRequest,
  type ImageProvider,
} from "../types";

/**
 * NVIDIA NIM image generation (Stability SDXL by default).
 *
 *   POST https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl
 *   { "text_prompts": [{ "text": "…" }], "width": 1024, "height": 1024, … }
 *   → { "artifacts": [{ "base64": "…" }] }
 *
 * Creating pictures only: this endpoint has no "edit this photo" call, so the
 * studio offers editing through OpenAI or the keyless service instead.
 * Change the model with NVIDIA_IMAGE_MODEL (use an id from build.nvidia.com).
 */

/** SDXL likes multiples of 64 in a sane range. */
export function snapNvidiaSize(value: number): number {
  const snapped = Math.round(value / 64) * 64;
  return Math.min(1344, Math.max(512, snapped));
}

export type NvidiaImageOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Injected in tests so no network call is made. */
  fetchImpl?: typeof fetch;
};

export function createNvidiaImageProvider(options: NvidiaImageOptions = {}): ImageProvider {
  const key = options.apiKey ?? (process.env.NVIDIA_API_KEY ?? "").trim();
  const model = options.model ?? nvidiaImageModel();
  const baseUrl = options.baseUrl ?? nvidiaImageBaseUrl();
  const doFetch = options.fetchImpl ?? fetch;

  return {
    id: "nvidia",
    label: `NVIDIA ${model.split("/").pop() ?? model}`,
    supportsEdit: false,

    async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
      if (!key) throw new ImageProviderError("NVIDIA_API_KEY is not set", "unavailable");

      const width = snapNvidiaSize(request.width);
      const height = snapNvidiaSize(request.height);

      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text_prompts: [{ text: request.prompt, weight: 1 }],
            width,
            height,
            samples: 1,
            steps: 30,
            cfg_scale: 7,
            seed: 0,
          }),
          signal: request.signal,
          cache: "no-store",
        });
      } catch (error) {
        throw fetchError(error, request.signal);
      }

      if (!response.ok) {
        throw new ImageProviderError(
          `NVIDIA responded with HTTP ${response.status}`,
          "upstream",
          response.status,
        );
      }

      let body: { artifacts?: { base64?: string; finishReason?: string }[] };
      try {
        body = (await response.json()) as typeof body;
      } catch {
        throw new ImageProviderError("NVIDIA sent an unreadable answer", "bad_response");
      }

      const base64 = body.artifacts?.[0]?.base64;
      if (!base64) throw new ImageProviderError("NVIDIA returned no image", "bad_response");

      const bytes = decodeBase64(base64);
      const size = readImageSize(bytes) ?? { width, height };
      return { bytes, mime: sniffImageMime(bytes) ?? "image/png", ...size };
    },
  };
}

function fetchError(error: unknown, signal: AbortSignal): ImageProviderError {
  if (signal.aborted) {
    const reason = signal.reason as { name?: string } | undefined;
    return reason?.name === "TimeoutError"
      ? new ImageProviderError("NVIDIA request timed out", "timeout")
      : new ImageProviderError("Request was cancelled", "aborted");
  }
  return new ImageProviderError(
    `NVIDIA request failed: ${(error as Error)?.message ?? "unknown error"}`,
    "unavailable",
  );
}
