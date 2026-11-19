/**
 * The contract every AI provider follows. To switch AI services later,
 * write a new file in ./providers that returns an `AiProvider`, register it
 * in ./index.ts and set AI_PROVIDER in your environment. Nothing else changes.
 */
export type AiRequest = {
  /** The full text to send (user message + any attached file contents). */
  message: string;
  /** Stable id for the conversation, so the AI can remember context. */
  sessionId: string;
  /** Cancelled when the user leaves or the request times out. */
  signal: AbortSignal;
};

export interface AiProvider {
  /** Short id used in AI_PROVIDER, e.g. "sujan-core". */
  readonly id: string;
  /** Human-friendly name for logs/status. */
  readonly label: string;
  /** Use this if the API returns the whole reply at once (like the PROXIMA Core API). */
  complete?(request: AiRequest): Promise<string>;
  /** Use this if the API streams tokens. Yield text pieces as they arrive. */
  stream?(request: AiRequest): AsyncIterable<string>;
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
