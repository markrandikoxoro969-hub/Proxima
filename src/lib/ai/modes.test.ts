import { describe, expect, it } from "vitest";
import { DEFAULT_MODE, isChatMode, MODES, modeInstruction, withMode } from "./modes";

describe("answer modes", () => {
  it("offers the four modes the composer shows", () => {
    expect(MODES.map((mode) => mode.id)).toEqual(["thinking", "fast", "pro", "coding"]);
  });

  it("only accepts known modes", () => {
    expect(isChatMode("pro")).toBe(true);
    expect(isChatMode("turbo")).toBe(false);
    expect(isChatMode(undefined)).toBe(false);
  });

  it("falls back to Thinking for a missing or unknown mode", () => {
    expect(modeInstruction(undefined)).toBe(modeInstruction(DEFAULT_MODE));
    expect(modeInstruction("nope" as never)).toContain("Mode: Thinking");
  });

  it("gives each mode distinct instructions", () => {
    expect(modeInstruction("fast")).toContain("fewest words");
    expect(modeInstruction("pro")).toContain("trade-offs");
    expect(modeInstruction("coding")).toContain("fenced block");
  });

  it("appends to the system prompt without changing it", () => {
    expect(withMode("BASE", "coding").startsWith("BASE\n\nMode: Coding.")).toBe(true);
  });
});
