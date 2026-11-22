/**
 * An image as the browser sees it (no bytes — those come from /api/images/:id).
 */
export type ImageSource = "upload" | "generated" | "edited";

export type ImageDTO = {
  id: string;
  url: string;
  mime: string;
  width: number;
  height: number;
  source: ImageSource;
  prompt: string | null;
  createdAt: string;
};

/**
 * The contract every image engine follows.
 *
 * To add another service: copy a file in ./providers, export a factory that
 * returns an `ImageProvider`, register it in ./index.ts and set
 * IMAGE_PROVIDER=<id>. Nothing else in the app changes.
 */
export type ImageGenerationRequest = {
  prompt: string;
  width: number;
  height: number;
  signal: AbortSignal;
};

export type ImageEditRequest = {
  /** What to change ("make the sky stormy"). */
  prompt: string;
  width: number;
  height: number;
  /** The picture to change (bytes + a data URL for providers that take one). */
  image: { bytes: Uint8Array; mime: string; dataUrl: string };
  /** 0.1 (subtle) … 0.9 (bold). Providers that don't support it ignore it. */
  strength: number;
  /** Public address of the source image, for services that fetch it themselves. */
  sourceUrl?: string;
  signal: AbortSignal;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
};

export type ImageErrorCode =
  | "unavailable"
  | "timeout"
  | "upstream"
  | "bad_response"
  | "unsupported"
  | "aborted"
  | "edit_input"
  | "unsupported_source";

/** Thrown by providers; `code` decides the friendly message the person sees. */
export class ImageProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ImageErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}

export interface ImageProvider {
  /** Short id used in IMAGE_PROVIDER, e.g. "openai". */
  readonly id: string;
  /** Human-friendly name for logs and the studio footer. */
  readonly label: string;
  /** Can this engine change an existing picture? */
  readonly supportsEdit: boolean;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
  edit?(request: ImageEditRequest): Promise<GeneratedImage>;
}
