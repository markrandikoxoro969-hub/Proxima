import { ApiError, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin, hashedClientId } from "@/lib/api/security";
import { getApiUserId } from "@/lib/auth/api";
import { enforceRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { getSpeechProvider } from "@/lib/speech";
import { SpeechProviderError } from "@/lib/speech/types";
import { speechTimeoutMs } from "@/lib/speech/settings";
import { speechRequestSchema } from "@/lib/validation";

/**
 * POST /api/speech — turn one piece of an answer into natural-sounding audio.
 *
 * Body: { text: "…", voice: "girl" | "boy", speed?: 1 }
 * Reply: audio/mpeg bytes (not JSON).
 *
 * The browser splits long answers into sentence-sized pieces and caches the
 * resulting blobs, so replaying a reply is instant. If this route fails for
 * any reason, the client quietly uses the device's own speech synthesis.
 *
 * Signed in: 90 pieces/minute. Guest demo: 20/minute. The limit fails open
 * when the database is unavailable — voice is free and harmless, and a DB
 * outage should not silence Proxima.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const UNAVAILABLE =
  "Natural voice isn't available right now. Try again, or switch Voice quality to Device in the voice menu.";

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await getApiUserId();
  const input = speechRequestSchema.parse(await readJson(request, 16 * 1024));

  const rate = userId
    ? await enforceRateLimit(
        `speech:user:${userId}`,
        RATE_LIMITS.speechUser,
        "You're listening very fast — please wait a moment, or use Device voice.",
        { failOpen: true },
      )
    : await enforceRateLimit(
        `speech:guest:${hashedClientId(request)}`,
        RATE_LIMITS.speechGuest,
        "Demo listening limit reached. Sign in for more, or use Device voice.",
        { failOpen: true },
      );

  const provider = getSpeechProvider();
  if (!provider) throw new ApiError(503, "speech_unavailable", UNAVAILABLE, { "Retry-After": "10" });

  try {
    // Stop the vendor call if the listener presses Stop (the browser aborts the
    // fetch) or if the provider goes quiet for too long.
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(speechTimeoutMs())]);
    const audio = await provider.synthesize({
      text: input.text,
      voice: input.voice,
      speed: input.speed,
      signal,
    });

    return new Response(audio.bytes.slice().buffer, {
      status: 200,
      headers: {
        "Content-Type": audio.mime,
        "Content-Length": String(audio.bytes.byteLength),
        // The tab keeps its own in-memory copy; never leave answer audio in the
        // browser's HTTP cache after the tab closes.
        "Cache-Control": "no-store",
        "X-Speech-Provider": audio.provider,
        ...rateLimitHeaders(rate),
      },
    });
  } catch (error) {
    const speechError =
      error instanceof SpeechProviderError ? error : new SpeechProviderError(String(error), "unavailable");
    // Never log the text or a key — only which engine failed and why.
    console.warn(`[speech] request failed (${speechError.code})`);

    if (speechError.code === "aborted") {
      throw new ApiError(499, "aborted", "Voice request was cancelled.");
    }
    if (speechError.code === "timeout") {
      throw new ApiError(504, "speech_timeout", UNAVAILABLE, { "Retry-After": "10" });
    }
    throw new ApiError(503, "speech_unavailable", UNAVAILABLE, { "Retry-After": "10" });
  }
});
