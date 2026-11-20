import type { ChatMode } from "@/lib/ai/modes";
import { toApiError } from "./api";
import { FrameBatcher } from "./frame-batcher";
import { readChatStream, type ChatStreamEvent } from "./sse";

/**
 * Sends a message to POST /api/chat and reports what happens, step by step.
 * Used by /app now and by the landing-page demo in Phase 5.
 *
 * Text arrives through `onText` at most once per animation frame.
 */
export type ChatRequestBody = {
  message: string;
  conversationId?: string;
  attachments?: { name: string; content: string }[];
  /** Pictures attached to this message, by id (signed-in only). */
  images?: { id: string }[];
  demoSessionId?: string;
  retry?: boolean;
  /** Ask the server to stream the model's private reasoning (off by default). */
  showReasoning?: boolean;
  /** Answer style: fast / thinking / coding / analyze. */
  mode?: ChatMode;
  /** Temporary chat: nothing is saved and memory is not used. */
  temporary?: boolean;
  /** Guest demo only: recent turns so the demo keeps its memory. */
  history?: { role: "user" | "assistant"; content: string }[];
};

export type StreamError = { code: string; message: string; retryable: boolean; status?: number };

type Data<E extends ChatStreamEvent["event"]> = Extract<ChatStreamEvent, { event: E }>["data"];

export type StreamHandlers = {
  onMeta?: (data: Data<"meta">) => void;
  onStatus?: (data: Data<"status">) => void;
  onText: (text: string) => void;
  /** Private "thinking" text. Only arrives when the user asked for it. */
  onReasoning?: (text: string) => void;
  onDone: (data: Data<"done">) => void;
  onError: (error: StreamError) => void;
  /** The user pressed Stop. */
  onAbort?: () => void;
};

export async function streamChat(
  body: ChatRequestBody,
  { signal, ...handlers }: StreamHandlers & { signal?: AbortSignal },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch {
    if (signal?.aborted) return handlers.onAbort?.();
    return handlers.onError({
      code: "offline",
      message: "You seem to be offline. Check your connection and try again.",
      retryable: true,
    });
  }

  if (!res.ok || !res.body) {
    const error = await toApiError(res);
    return handlers.onError({
      code: error.code,
      message: error.message,
      status: error.status,
      // 429 / 5xx can succeed later; bad input or no login won't.
      retryable: error.status === 429 || error.status >= 500,
    });
  }

  const batcher = new FrameBatcher(handlers.onText);
  let finished = false;
  try {
    for await (const event of readChatStream(res.body)) {
      switch (event.event) {
        case "meta":
          handlers.onMeta?.(event.data);
          break;
        case "status":
          handlers.onStatus?.(event.data);
          break;
        case "token":
          batcher.push(event.data.text);
          break;
        case "reasoning":
          handlers.onReasoning?.(event.data.text);
          break;
        case "done":
          batcher.flush();
          finished = true;
          handlers.onDone(event.data);
          break;
        case "error":
          batcher.flush();
          finished = true;
          handlers.onError(event.data);
          break;
      }
    }
    if (!finished) {
      batcher.flush();
      handlers.onError({
        code: "interrupted",
        message: "The connection dropped before the reply finished.",
        retryable: true,
      });
    }
  } catch {
    batcher.flush();
    if (signal?.aborted) handlers.onAbort?.();
    else
      handlers.onError({
        code: "interrupted",
        message: "The connection dropped before the reply finished.",
        retryable: true,
      });
  } finally {
    batcher.dispose();
  }
}
