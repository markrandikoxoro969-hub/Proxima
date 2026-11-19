// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSseChunk, readChatStream } from "./sse";

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe("parseSseChunk", () => {
  it("parses complete events and keeps the unfinished tail", () => {
    const { events, rest } = parseSseChunk('event: delta\ndata: {"text":"Hi"}\n\nevent: del');
    expect(events).toEqual([{ event: "delta", data: '{"text":"Hi"}' }]);
    expect(rest).toBe("event: del");
  });

  it("ignores keep-alive comments and handles Windows line endings", () => {
    const { events } = parseSseChunk(': ping\r\n\r\nevent: done\r\ndata: {"latencyMs":5}\r\n\r\n');
    expect(events).toEqual([{ event: "done", data: '{"latencyMs":5}' }]);
  });

  it("joins multi-line data", () => {
    const { events } = parseSseChunk("data: line1\ndata: line2\n\n");
    expect(events[0]).toEqual({ event: "message", data: "line1\nline2" });
  });
});

describe("readChatStream", () => {
  it("rebuilds events split across network chunks (even mid-character)", async () => {
    const full =
      'event: meta\ndata: {"mode":"user","conversationId":"c1","title":"T","userMessageId":"u1"}\n\nevent: delta\ndata: {"text":"नमस्ते 👋"}\n\nevent: done\ndata: {"messageId":"m1","latencyMs":42,"source":"x"}\n\n';
    const bytes = new TextEncoder().encode(full);
    // Split into 7-byte pieces → multi-byte characters get cut in half.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    const events = [];
    for await (const e of readChatStream(stream)) events.push(e);
    expect(events.map((e) => e.event)).toEqual(["meta", "delta", "done"]);
    expect(events[1]).toEqual({ event: "delta", data: { text: "नमस्ते 👋" } });
  });

  it("skips a malformed event instead of failing the whole reply", async () => {
    const events = [];
    for await (const e of readChatStream(
      streamOf("event: delta\ndata: {oops\n\n", 'event: delta\ndata: {"text":"ok"}\n\n'),
    )) {
      events.push(e);
    }
    expect(events).toEqual([{ event: "delta", data: { text: "ok" } }]);
  });

  it("handles a final event without the trailing blank line", async () => {
    const events = [];
    for await (const e of readChatStream(streamOf('event: delta\ndata: {"text":"end"}'))) events.push(e);
    expect(events).toHaveLength(1);
  });
});
