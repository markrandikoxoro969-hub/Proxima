import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn()", () => {
  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
  it("treats glass and glass-solid as alternatives", () => {
    expect(cn("glass", "glass-solid")).toBe("glass-solid");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});
