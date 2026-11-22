import type { ChatMode } from "./modes";

/**
 * The contract every AI provider follows. To switch AI services later,
 * write a new file in ./providers that returns an `AiProvider`, register it
 * in ./index.ts and set AI_PROVIDER in your environment. Nothing else changes.
 */
export type AiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/** A picture attached to the newest message (already validated + owned by the sender). */
export type AiImage = {
  /** `data:image/…;base64,…` — sent to vision models, never written to the database. */
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
};

export type AiRequest = {
  /** The newest message (user message + any attached file contents). */
  message: string;
  /** Stable id for the conversation, so the AI can remember context. */
  sessionId: string;
  /** Cancelled when the user leaves or the request times out. */
  signal: AbortSignal;
  /** Earlier turns, oldest → newest (at most 20). */
  history?: AiHistoryMessage[];
  /** Overrides PROXIMA's default system prompt. */
  system?: string;
  /** Let the provider emit its private reasoning (never shown by default). */
  showReasoning?: boolean;
  /** Answer style chosen in the composer (fast / thinking / coding / analyze). */
  mode?: ChatMode;
  /** Pictures attached to the newest message, in order. */
  images?: AiImage[];
};

/**
 * A piece of the stream. `text` becomes the answer; `reasoning` is the model's
 * private thinking. Reasoning is never saved and never shown unless the user
 * turns on Settings → Show reasoning. `activity` is an empty keep-alive from a
 * provider buffering a continuation; it is never displayed or saved.
 */
export type AiDelta = { type: "text" | "reasoning" | "activity"; text: string };

export interface AiProvider {
  /** Short id used in AI_PROVIDER, e.g. "nvidia". */
  readonly id: string;
  /** Human-friendly name for logs/status. */
  readonly label: string;
  /** Use this if the API returns the whole reply at once (like the PROXIMA Core API). */
  complete?(request: AiRequest): Promise<string>;
  /** Use this if the API streams tokens. Yield pieces as they arrive. */
  stream?(request: AiRequest): AsyncIterable<AiDelta>;
  /** Optional health check / wake-up call. Resolves with latency in ms. */
  ping?(signal: AbortSignal): Promise<number>;
}

export type AiErrorCode = "timeout" | "unavailable" | "upstream" | "bad_response" | "aborted";

/** Thrown by providers. `code` decides the friendly message the user sees. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AiErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
