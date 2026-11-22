import type { ChatMode } from "@/lib/ai/modes";
import { toApiError } from "./api";
import { FrameBatcher } from "./frame-batcher";
import { readChatStream, type ChatStreamEvent } from "./sse";

/**
 * Sends a message to POST /api/chat and reports what happens, step by step.
 * Used by /app now and by the landing-page demo in Phase 5.
 *
 * Text arrives through `onText` in small, steady pieces (see FrameBatcher).
 */
export type ChatRequestBody = {
  message: string;
  conversationId?: string;
  attachments?: { name: string; content: string }[];
  /** Pictures attached to this message, by id (signed-in only). */
  images?: { id: string }[];
  demoSessionId?: string;
  retry?: boolean;
  /** Internal protocol: checkpoint one file per request. */
  codingStep?: boolean;
  codingContinue?: boolean;
  /** Ask the server to stream the model's private reasoning (off by default). */
  showReasoning?: boolean;
  /** Answer style: fast / thinking / coding / analyze. */
  mode?: ChatMode;
  /** IDs of enabled, installed skills selected in Settings for chat replies. */
  skills?: string[];
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
  onFilePreview?: (data: Data<"file-preview">) => void;
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
  let current: ChatRequestBody = { ...body, codingStep: true };
  let lastCompleted = -1;
  let retries = 0;
  // At most 12 files and two automatic timeout retries per file.
  for (let step = 0; step < 36; step++) {
    if (signal?.aborted) return handlers.onAbort?.();
    const next = await streamChatOnce(current, { ...handlers, signal }, step > 0);
    if (!next) return;
    if (next.completedFiles < lastCompleted || (!next.retry && next.completedFiles === lastCompleted)) {
      handlers.onError({
        code: "interrupted",
        message: "The project checkpoint did not advance. Retry to resume.",
        retryable: true,
      });
      return;
    }
    if (next.completedFiles > lastCompleted) retries = 0;
    lastCompleted = next.completedFiles;
    if (next.retry && ++retries > 2) {
      handlers.onError({
        code: "timeout",
        message: "The current file timed out repeatedly. Your completed files are saved; retry to resume.",
        retryable: true,
      });
      return;
    }
    current = { ...current, conversationId: next.conversationId, retry: true, codingContinue: true };
    handlers.onStatus?.({
      state: "thinking",
      message: next.retry
        ? "The file timed out. Retrying from the saved checkpoint…"
        : "Saved the file. Continuing the project…",
    });
  }
  handlers.onError({
    code: "interrupted",
    message: "The project paused after too many continuation steps. Retry to resume.",
    retryable: true,
  });
}

async function streamChatOnce(
  body: ChatRequestBody,
  { signal, ...handlers }: StreamHandlers & { signal?: AbortSignal },
  continuing: boolean,
): Promise<Data<"coding-continue"> | undefined> {
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
    if (signal?.aborted) {
      handlers.onAbort?.();
      return;
    }
    handlers.onError({
      code: "offline",
      message: "You seem to be offline. Check your connection and try again.",
      retryable: true,
    });
    return;
  }

  if (!res.ok || !res.body) {
    const error = await toApiError(res);
    handlers.onError({
      code: error.code,
      message: error.message,
      status: error.status,
      // 429 / 5xx can succeed later; bad input or no login won't.
      retryable: error.status === 429 || error.status >= 500,
    });
    return;
  }

  const batcher = new FrameBatcher(handlers.onText);
  let finished = false;
  try {
    for await (const event of readChatStream(res.body)) {
      switch (event.event) {
        case "meta":
          if (!continuing) handlers.onMeta?.(event.data);
          break;
        case "status":
          batcher.flush(); // Keep progress updates ordered after earlier file text.
          handlers.onStatus?.(event.data);
          break;
        case "token":
          batcher.push(event.data.text);
          break;
        case "coding-continue":
          batcher.flush();
          finished = true;
          if (
            typeof event.data.conversationId !== "string" ||
            !event.data.conversationId ||
            !Number.isInteger(event.data.completedFiles) ||
            event.data.completedFiles < 0 ||
            event.data.completedFiles >= 12 ||
            typeof event.data.retry !== "boolean"
          ) {
            handlers.onError({
              code: "interrupted",
              message: "The project checkpoint was invalid. Retry to resume.",
              retryable: true,
            });
            return;
          }
          return event.data;
        case "file-preview":
          batcher.flush();
          handlers.onFilePreview?.(event.data);
          break;
        case "reasoning":
          handlers.onReasoning?.(event.data.text);
          break;
        case "done":
          batcher.flush();
          finished = true;
          handlers.onDone(event.data);
          return;
        case "error":
          batcher.flush();
          finished = true;
          handlers.onError(event.data);
          return;
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
    if (finished) return;
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
