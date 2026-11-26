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
  /** Opt in to multi-step autonomous agent mode. */
  agentMode?: boolean;
  /** Internal protocol: resume a persisted AgentCheckpoint in a fresh invocation. */
  agentContinue?: boolean;
  /** Explicit user approval for a paused destructive agent step. */
  approvedStepId?: string;
  /** Ask the server to stream the model's private reasoning (off by default). */
  showReasoning?: boolean;
  /** Answer style: fast / thinking / coding / analyze. */
  mode?: ChatMode;
  /** IDs of enabled, installed skills selected in Settings for chat replies. */
  skills?: string[];
  /** Temporary chat: nothing is saved and memory is not used. */
  temporary?: boolean;
  /** Guest/temporary recent turns; images are owner-checked IDs, never bytes. */
  history?: { role: "user" | "assistant"; content: string; images?: { id: string }[] }[];
};

export type StreamError = { code: string; message: string; retryable: boolean; status?: number };

type Data<E extends ChatStreamEvent["event"]> = Extract<ChatStreamEvent, { event: E }>["data"];

export type StreamHandlers = {
  onMeta?: (data: Data<"meta">) => void;
  onStatus?: (data: Data<"status">) => void;
  onText: (text: string) => void;
  onFilePreview?: (data: Data<"file-preview">) => void;
  /** Emitted when an autonomous agent step pauses for explicit user approval. */
  onAgentApproval?: (data: Data<"agent-approval">) => void;
  /** Private "thinking" text. Only arrives when the user asked for it. */
  onReasoning?: (text: string) => void;
  onDone: (data: Data<"done">) => void;
  onError: (error: StreamError) => void;
  /** The user pressed Stop. */
  onAbort?: () => void;
};

type Continuation =
  | { kind: "coding"; conversationId: string; completed: number; retry: boolean }
  | { kind: "agent"; conversationId: string; completed: number; total: number; retry: boolean };

export async function streamChat(
  body: ChatRequestBody,
  { signal, ...handlers }: StreamHandlers & { signal?: AbortSignal },
): Promise<void> {
  let current: ChatRequestBody = { ...body, codingStep: true };
  let lastCompleted = -1;
  let retries = 0;
  // At most 12 files / steps and two automatic timeout retries per step.
  for (let step = 0; step < 36; step++) {
    if (signal?.aborted) return handlers.onAbort?.();
    const next = await streamChatOnce(current, { ...handlers, signal }, step > 0);
    if (!next) return;
    if (next.completed < lastCompleted || (!next.retry && next.completed === lastCompleted)) {
      handlers.onError({
        code: "interrupted",
        message:
          next.kind === "agent"
            ? "The agent checkpoint did not advance. Retry to resume."
            : "The project checkpoint did not advance. Retry to resume.",
        retryable: true,
      });
      return;
    }
    if (next.completed > lastCompleted) retries = 0;
    lastCompleted = next.completed;
    if (next.retry && ++retries > 2) {
      handlers.onError({
        code: "timeout",
        message:
          next.kind === "agent"
            ? "The current agent step timed out repeatedly. Completed steps are saved; retry to resume."
            : "The current file timed out repeatedly. Your completed files are saved; retry to resume.",
        retryable: true,
      });
      return;
    }
    current =
      next.kind === "agent"
        ? {
            ...current,
            conversationId: next.conversationId,
            retry: true,
            agentContinue: true,
            codingContinue: undefined,
            approvedStepId: undefined,
          }
        : {
            ...current,
            conversationId: next.conversationId,
            retry: true,
            codingContinue: true,
            agentContinue: undefined,
          };
    handlers.onStatus?.({
      state: "thinking",
      message:
        next.kind === "agent"
          ? next.retry
            ? "Step timed out. Retrying from saved checkpoint…"
            : `Saved step ${next.completed}/${next.total}. Continuing…`
          : next.retry
            ? "The file timed out. Retrying from the saved checkpoint…"
            : "Saved the file. Continuing the project…",
    });
  }
  handlers.onError({
    code: "interrupted",
    message: "The task paused after too many continuation steps. Retry to resume.",
    retryable: true,
  });
}

async function streamChatOnce(
  body: ChatRequestBody,
  { signal, ...handlers }: StreamHandlers & { signal?: AbortSignal },
  continuing: boolean,
): Promise<Continuation | undefined> {
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
          return {
            kind: "coding",
            conversationId: event.data.conversationId,
            completed: event.data.completedFiles,
            retry: event.data.retry,
          };
        case "agent-continue":
          batcher.flush();
          finished = true;
          if (
            typeof event.data.conversationId !== "string" ||
            !event.data.conversationId ||
            !Number.isInteger(event.data.completedSteps) ||
            event.data.completedSteps < 0 ||
            !Number.isInteger(event.data.totalSteps) ||
            event.data.totalSteps < 1 ||
            event.data.totalSteps > 12 ||
            typeof event.data.retry !== "boolean"
          ) {
            handlers.onError({
              code: "interrupted",
              message: "The agent checkpoint was invalid. Retry to resume.",
              retryable: true,
            });
            return;
          }
          return {
            kind: "agent",
            conversationId: event.data.conversationId,
            completed: event.data.completedSteps,
            total: event.data.totalSteps,
            retry: event.data.retry,
          };
        case "agent-approval":
          batcher.flush();
          finished = true;
          handlers.onAgentApproval?.(event.data);
          return;
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
