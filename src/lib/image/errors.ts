import "server-only";
import { ApiError } from "@/lib/api/http";
import { ImageProviderError } from "./types";

/**
 * Turns an engine failure into the friendly, typed error the studio shows.
 * Nothing here includes the prompt, a key or an upstream URL.
 */
export function imageApiError(error: unknown): unknown {
  if (!(error instanceof ImageProviderError)) return error;
  switch (error.code) {
    case "timeout":
      return new ApiError(504, "image_timeout", "The image engine took too long. Please try again.");
    case "unavailable":
      return new ApiError(
        503,
        "image_unavailable",
        "Couldn't reach the image engine. Check the server's image settings (docs/IMAGES.md).",
      );
    case "upstream":
      return new ApiError(
        502,
        "image_upstream",
        error.status === 401 || error.status === 402 || error.status === 403 || error.status === 429
          ? "The image service refused the request (key, credits or rate limit). Check the configured image provider key, credits and permissions, or try again in a minute."
          : "The image engine had a problem. Please try again.",
      );
    case "unsupported_source":
      return new ApiError(422, "image_edit_input", "Please use a PNG, JPEG or WebP image for this edit.");
    case "edit_input":
      return new ApiError(
        422,
        "image_edit_input",
        "NVIDIA rejected this edit. Its hosted Kontext preview documents support for sample images only; use OpenAI or a self-hosted Kontext endpoint for your own images. See docs/IMAGES.md.",
      );
    case "unsupported":
      return new ApiError(
        422,
        "image_unsupported",
        "This engine can't edit pictures. Configure Pollinations, NVIDIA editing, or OpenAI — see docs/IMAGES.md.",
      );
    case "bad_response":
      return new ApiError(
        502,
        "image_bad_response",
        "The engine sent an unexpected answer. Please try again.",
      );
    case "aborted":
      return new ApiError(499, "aborted", "The request was cancelled.");
    default:
      return new ApiError(502, "image_failed", "The image engine failed. Please try again.");
  }
}
