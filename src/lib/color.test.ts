import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureContrast,
  formatContrast,
  isHexColor,
  mix,
  parseHex,
  relativeLuminance,
  toHex,
  withAlpha,
} from "./color";

describe("colour helpers", () => {
  it("parses short and long hex colours", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#0a0b0c")).toEqual({ r: 10, g: 11, b: 12 });
    expect(parseHex("0A0B0C")).toEqual({ r: 10, g: 11, b: 12 });
    expect(toHex({ r: 10, g: 11, b: 12 })).toBe("#0a0b0c");
  });

  it("rejects anything that isn't a hex colour", () => {
    expect(parseHex("red")).toBeNull();
    expect(parseHex("#12")).toBeNull();
    expect(parseHex("#gggggg")).toBeNull();
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("rgb(1,2,3)")).toBe(false);
  });

  it("mixes towards the second colour", () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 2)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(formatContrast(4.567)).toBe("4.6:1");
  });

  it("nudges a colour until it is readable", () => {
    const faint = { r: 90, g: 90, b: 90 };
    const surface = { r: 5, g: 5, b: 5 };
    expect(contrastRatio(faint, surface)).toBeLessThan(4.6);
    const fixed = ensureContrast(faint, surface, 4.6, { r: 248, g: 250, b: 252 });
    expect(contrastRatio(fixed, surface)).toBeGreaterThanOrEqual(4.6);
  });

  it("writes translucent css colours", () => {
    expect(withAlpha({ r: 15, g: 23, b: 42 }, 0.09)).toBe("rgb(15 23 42 / 0.09)");
    expect(withAlpha({ r: 1, g: 2, b: 3 }, 5)).toBe("rgb(1 2 3 / 1)");
  });
});
