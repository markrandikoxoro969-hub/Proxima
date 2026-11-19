import "server-only";

/**
 * Server-Sent Events (SSE): one long HTTP response that sends small
 * messages as they happen. Each message looks like:
 *
 *   event: delta
 *   data: {"text":"Hello"}
 *
 * The browser reads them one by one (see the chat client in Phase 4).
 */
export type SseWriter = {
  send: (event: string, data: unknown) => void;
  /** A comment line keeps proxies from closing a quiet connection. */
  ping: () => void;
  close: () => void;
  readonly closed: boolean;
};

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // disable buffering on nginx-style proxies
};

export function createSseStream(
  run: (writer: SseWriter) => Promise<void>,
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true; // browser went away
        }
      };
      const writer: SseWriter = {
        send: (event, data) => enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        ping: () => enqueue(`: ping\n\n`),
        close: () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        get closed() {
          return closed;
        },
      };
      try {
        await run(writer);
      } finally {
        writer.close();
      }
    },
    cancel() {
      closed = true;
      onCancel?.();
    },
  });
}
