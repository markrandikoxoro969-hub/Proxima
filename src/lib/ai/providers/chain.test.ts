// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AiDelta, AiProvider } from "../types";
import { createFallbackProvider } from "./chain";

const request = {
  message: "hello",
  sessionId: "s1",
  signal: new AbortController().signal,
};

const collect = async (iterable: AsyncIterable<AiDelta>) => {
  const out: AiDelta[] = [];
  for await (const d of iterable) out.push(d);
  return out;
};

const provider = (
  id: string,
  behaviour: "ok" | "fail" | "fail-after-text" | "complete-ok",
  log?: string[],
): AiProvider => ({
  id,
  label: id,
  ...(behaviour === "complete-ok"
    ? {
        async complete() {
          log?.push(`${id}:complete`);
          return "whole reply";
        },
      }
    : {
        async *stream() {
          log?.push(`${id}:stream`);
          if (behaviour === "fail") throw new Error("down");
          yield { type: "reasoning" as const, text: "thinking" };
          yield { type: "text" as const, text: `${id} says hi` };
          if (behaviour === "fail-after-text") throw new Error("dropped");
        },
      }),
});

describe("createFallbackProvider", () => {
  it("uses the primary when it works", async () => {
    const log: string[] = [];
    const chain = createFallbackProvider({
      primary: provider("nvidia", "ok", log),
      fallback: provider("render", "complete-ok", log),
    });
    const deltas = await collect(chain.stream!(request));
    expect(deltas.map((d) => d.text).join("")).toContain("nvidia says hi");
    expect(log).toEqual(["nvidia:stream"]);
  });

  it("falls back when the primary fails before answering", async () => {
    const log: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chain = createFallbackProvider({
      primary: provider("nvidia", "fail", log),
      fallback: provider("render", "complete-ok", log),
    });
    const deltas = await collect(chain.stream!(request));
    expect(deltas.map((d) => d.text).join("")).toBe("whole reply");
    expect(log).toEqual(["nvidia:stream", "render:complete"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back when the primary only produced reasoning", async () => {
    const primary: AiProvider = {
      id: "nvidia",
      label: "nvidia",
      async *stream() {
        yield { type: "reasoning", text: "hmm" };
        throw new Error("timeout");
      },
    };
    const chain = createFallbackProvider({
      primary,
      fallback: provider("render", "complete-ok"),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deltas = await collect(chain.stream!(request));
    expect(
      deltas
        .filter((d) => d.type === "text")
        .map((d) => d.text)
        .join(""),
    ).toBe("whole reply");
    warn.mockRestore();
  });

  it("never mixes two answers after text has been shown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chain = createFallbackProvider({
      primary: provider("nvidia", "fail-after-text"),
      fallback: provider("render", "complete-ok"),
    });
    await expect(collect(chain.stream!(request))).rejects.toThrow("dropped");
    warn.mockRestore();
  });

  it("does not cut off an answer that keeps streaming past the first-token deadline", async () => {
    const primary: AiProvider = {
      id: "nvidia",
      label: "nvidia",
      async *stream({ signal }) {
        yield { type: "text", text: "long " };
        // A real model can spend a while between tokens on a big code block.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 80);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(signal.reason ?? new Error("aborted"));
            },
            { once: true },
          );
        });
        yield { type: "text", text: "answer" };
      },
    };
    const chain = createFallbackProvider({
      primary,
      fallback: provider("render", "complete-ok"),
      primaryTimeoutMs: 20,
    });
    const deltas = await collect(chain.stream!(request));
    expect(deltas.map((d) => d.text).join("")).toBe("long answer");
  });

  it("still falls back when the primary is silent past the first-token deadline", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onFallback = vi.fn();
    const primary: AiProvider = {
      id: "nvidia",
      label: "nvidia",
      async *stream({ signal }) {
        await new Promise<never>((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    };
    const chain = createFallbackProvider({
      primary,
      fallback: provider("render", "complete-ok"),
      primaryTimeoutMs: 20,
      onFallback,
    });
    const deltas = await collect(chain.stream!(request));
    expect(deltas.map((d) => d.text).join("")).toBe("whole reply");
    expect(onFallback).toHaveBeenCalledWith("nvidia failed (unavailable)");
    warn.mockRestore();
  });

  it("does not fall back when the user pressed Stop", async () => {
    const controller = new AbortController();
    controller.abort();
    const chain = createFallbackProvider({
      primary: {
        id: "nvidia",
        label: "nvidia",
        async *stream({ signal }) {
          if (signal.aborted) throw new Error("aborted");
          yield { type: "text", text: "never" };
        },
      },
      fallback: provider("render", "complete-ok"),
    });
    await expect(collect(chain.stream!({ ...request, signal: controller.signal }))).rejects.toThrow(
      "aborted",
    );
  });
});
