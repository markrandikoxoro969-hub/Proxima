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
      return new ApiError(502, "image_upstream", "The image engine had a problem. Please try again.");
    case "unsupported":
      return new ApiError(
        422,
        "image_unsupported",
        "That engine can't edit pictures. Add an OpenAI key, or set NEXT_PUBLIC_SITE_URL so the free editor can reach your image.",
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

/** Public address of one of our images, for services that fetch it themselves. */
export function publicImageUrl(id: string): string | undefined {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(raw)) return undefined;
  try {
    const host = new URL(raw).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return undefined;
  } catch {
    return undefined;
  }
  return `${raw}/api/images/${id}`;
}
