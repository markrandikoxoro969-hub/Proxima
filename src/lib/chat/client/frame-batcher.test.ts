import { describe, expect, it } from "vitest";
import { FrameBatcher } from "./frame-batcher";

function setup() {
  const flushed: string[] = [];
  const frames: (() => void)[] = [];
  const batcher = new FrameBatcher(
    (t) => flushed.push(t),
    (cb) => frames.push(cb),
    () => {},
  );
  const runFrame = () => frames.splice(0).forEach((f) => f());
  return { batcher, flushed, frames, runFrame };
}

describe("FrameBatcher", () => {
  it("delivers many pieces as ONE update per frame", () => {
    const { batcher, flushed, frames, runFrame } = setup();
    for (const piece of ["Hel", "lo", " ", "world"]) batcher.push(piece);
    expect(frames).toHaveLength(1); // only one frame scheduled
    expect(flushed).toEqual([]);
    runFrame();
    expect(flushed).toEqual(["Hello world"]);
    batcher.push("!");
    runFrame();
    expect(flushed).toEqual(["Hello world", "!"]);
  });

  it("flush() sends pending text immediately (before done/error)", () => {
    const { batcher, flushed } = setup();
    batcher.push("last bit");
    batcher.flush();
    expect(flushed).toEqual(["last bit"]);
    batcher.flush();
    expect(flushed).toHaveLength(1); // nothing duplicated
  });

  it("dispose() drops pending text", () => {
    const { batcher, flushed, runFrame } = setup();
    batcher.push("gone");
    batcher.dispose();
    runFrame();
    expect(flushed).toEqual([]);
  });
});
