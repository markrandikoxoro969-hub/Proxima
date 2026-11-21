import "server-only";
import { decodeBase64, sniffImageMime } from "../data-url";
import {
  nvidiaEditingKey,
  nvidiaGenerationKey,
  nvidiaImageBaseUrl,
  nvidiaImageEditModel,
  nvidiaImageModel,
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
 * NVIDIA NIM — FLUX.1 dev creates pictures, FLUX.1 Kontext edits them.
 *
 *   POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev
 *   { "prompt": "…", "mode": "base", "cfg_scale": 3.5, "width": 1024,
 *     "height": 1024, "seed": 0, "steps": 50 }
 *
 *   POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev
 *   { "prompt": "make the sky stormy", "image": "data:image/png;base64,…",
 *     "seed": 0, "steps": 30 }
 *
 * Both answer { artifacts: [{ base64, finishReason, seed }] }. Each model can
 * live on its own NVIDIA account: `IMAGE_GENERATION` keys creation and
 * `IMAGE_EDITING` keys edits. The models can be overridden with
 * `IMAGE_GENERATION_MODEL` / `IMAGE_EDITING_MODEL`.
 */

/** FLUX likes multiples of 64 in a sane range. */
export function snapNvidiaSize(value: number): number {
  const snapped = Math.round(value / 64) * 64;
  return Math.min(1344, Math.max(512, snapped));
}

export type NvidiaImageOptions = {
  /** Key for FLUX.1 dev (creating). */
  apiKey?: string;
  /** Key for FLUX.1 Kontext (editing). */
  editApiKey?: string;
  model?: string;
  editModel?: string;
  baseUrl?: string;
  /** Injected in tests so no network call is made. */
  fetchImpl?: typeof fetch;
};

type NvidiaArtifactResponse = {
  artifacts?: { base64?: string; finishReason?: string; seed?: number }[];
};

export function createNvidiaImageProvider(options: NvidiaImageOptions = {}): ImageProvider {
  const generationKey = (options.apiKey ?? nvidiaGenerationKey()).trim();
  const editingKey = (options.editApiKey ?? nvidiaEditingKey()).trim();
  const model = options.model ?? nvidiaImageModel();
  const editModel = options.editModel ?? nvidiaImageEditModel();
  const baseUrl = options.baseUrl ?? nvidiaImageBaseUrl();
  const doFetch = options.fetchImpl ?? fetch;

  const invoke = async (
    key: string,
    targetModel: string,
    body: Record<string, unknown>,
    request: { width: number; height: number; signal: AbortSignal },
  ): Promise<GeneratedImage> => {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/${targetModel}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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

    let parsed: NvidiaArtifactResponse;
    try {
      parsed = (await response.json()) as NvidiaArtifactResponse;
    } catch {
      throw new ImageProviderError("NVIDIA sent an unreadable answer", "bad_response");
    }

    const base64 = parsed.artifacts?.[0]?.base64;
    if (!base64) throw new ImageProviderError("NVIDIA returned no image", "bad_response");

    const bytes = decodeBase64(base64);
    const size = readImageSize(bytes) ?? { width: request.width, height: request.height };
    return { bytes, mime: sniffImageMime(bytes) ?? "image/jpeg", ...size };
  };

  return {
    id: "nvidia",
    label: `NVIDIA ${model.split("/").pop() ?? model}`,
    supportsEdit: Boolean(editingKey),

    async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
      if (!generationKey) {
        throw new ImageProviderError("IMAGE_GENERATION is not set", "unavailable");
      }
      const width = snapNvidiaSize(request.width);
      const height = snapNvidiaSize(request.height);
      return invoke(
        generationKey,
        model,
        {
          prompt: request.prompt,
          mode: "base",
          cfg_scale: 3.5,
          width,
          height,
          seed: 0,
          steps: 50,
        },
        { width, height, signal: request.signal },
      );
    },

    async edit(request: ImageEditRequest): Promise<GeneratedImage> {
      if (!editingKey) {
        throw new ImageProviderError("IMAGE_EDITING is not set", "unavailable");
      }
      // Kontext takes the picture inline, so no public link is needed.
      return invoke(
        editingKey,
        editModel,
        {
          prompt: request.prompt,
          image: request.image.dataUrl,
          seed: 0,
          steps: 30,
        },
        { width: request.width, height: request.height, signal: request.signal },
      );
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
