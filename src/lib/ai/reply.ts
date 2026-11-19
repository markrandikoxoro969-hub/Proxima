import "server-only";
import { cleanIdentityLeaks } from "@/lib/identity";
import type { AiProvider, AiRequest } from "./types";

/**
 * Turns any provider into a stream of text pieces for the browser.
 *
 * - Streaming providers: pieces are passed straight through.
 * - "Whole reply" providers (like the PROXIMA Core API): the reply is cleaned,
 *   then sent in small word groups so it types out smoothly. Long replies go
 *   faster so typing never takes more than ~1.2s in total.
 */
export async function* generateReply(provider: AiProvider, request: AiRequest): AsyncGenerator<string> {
  if (provider.stream) {
    for await (const piece of provider.stream(request)) yield piece;
    return;
  }
  if (!provider.complete) throw new Error(`Provider ${provider.id} has neither complete() nor stream()`);
  const reply = cleanIdentityLeaks(await provider.complete(request));
  yield* typeOut(reply, request.signal);
}

/** Splits text into ≤ maxChunks pieces and yields them with a small delay. */
export async function* typeOut(
  text: string,
  signal?: AbortSignal,
  { maxChunks = 60, totalMs = Number(process.env.AI_STREAM_PACE_TOTAL_MS ?? 1200) } = {},
): AsyncGenerator<string> {
  const words = text.match(/\S+\s*|\s+/g) ?? [text];
  const perChunk = Math.max(1, Math.ceil(words.length / maxChunks));
  const chunkCount = Math.ceil(words.length / perChunk);
  const delay = chunkCount > 1 ? Math.min(25, totalMs / chunkCount) : 0;

  for (let i = 0; i < words.length; i += perChunk) {
    if (signal?.aborted) return;
    yield words.slice(i, i + perChunk).join("");
    if (delay > 0 && i + perChunk < words.length) await new Promise((r) => setTimeout(r, delay));
  }
}
