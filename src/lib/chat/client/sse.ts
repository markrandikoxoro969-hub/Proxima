import type { ChatMode } from "@/lib/ai/modes";

/**
 * Reads the Server-Sent Events stream from POST /api/chat.
 * (The browser's built-in EventSource only supports GET, so we parse it
 * ourselves from fetch's response body.)
 */
export type ChatStreamEvent =
  | {
      event: "meta";
      data: {
        /** Who is asking: a signed-in account or the landing-page demo. */
        mode: "user" | "guest";
        /** The answer style the server actually used. */
        answerMode?: ChatMode;
        conversationId: string | null;
        title: string | null;
        userMessageId: string | null;
        /** Saved file-by-file output shown before a resumed generation continues. */
        resumeText?: string;
      };
    }
  | { event: "status"; data: { state: "thinking" | "waking"; message?: string } }
  | { event: "token"; data: { text: string } }
  /** Only sent when the user turned on Settings → Show reasoning. */
  | { event: "reasoning"; data: { text: string } }
  | {
      event: "done";
      data: {
        messageId: string | null;
        latencyMs: number;
        source: string;
        /** The answer style the server actually used. */
        mode?: ChatMode;
        text?: string;
        /** Memories this answer used (only when Memory is on). */
        usedMemory?: { id: string; text: string }[];
      };
    }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } };

/** Splits raw SSE text into events. Keeps the unfinished tail for the next chunk. */
export function parseSseChunk(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: { event: string; data: string }[] = [];

  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue; // comment / keep-alive ping
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/** Yields typed events from a fetch Response body until the stream ends. */
export async function* readChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const { events, rest } = parseSseChunk(done ? `${buffer}\n\n` : buffer);
      buffer = rest;
      for (const e of events) {
        try {
          yield { event: e.event, data: JSON.parse(e.data) } as ChatStreamEvent;
        } catch {
          /* ignore a malformed event rather than breaking the whole reply */
        }
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
