import { describe, expect, it } from "vitest";
import {
  CHAT_MODES,
  DEFAULT_CHAT_MODE,
  isChatMode,
  MODE_CONFIG,
  modeModelSettings,
  modeSystemPrompt,
  resolveChatMode,
  resolveModeConfig,
} from "./modes";

describe("answer modes", () => {
  it("has exactly the four documented modes, all unique", () => {
    expect(CHAT_MODES).toEqual(["thinking", "fast", "coding", "analyze"]);
    expect(new Set(CHAT_MODES).size).toBe(4);
    for (const mode of CHAT_MODES) expect(MODE_CONFIG[mode].id).toBe(mode);
  });

  it("defaults safely for missing or unknown values (old clients)", () => {
    expect(DEFAULT_CHAT_MODE).toBe("thinking");
    expect(resolveChatMode("fast")).toBe("fast");
    expect(resolveChatMode("nonsense")).toBe("thinking");
    expect(resolveChatMode(undefined)).toBe("thinking");
    expect(resolveChatMode(null, "coding")).toBe("coding");
    expect(isChatMode("analyze")).toBe(true);
    expect(isChatMode("Analyze")).toBe(false);
    expect(resolveModeConfig("nonsense").id).toBe("thinking");
  });

  it("appends the mode rules after the base prompt, so they win", () => {
    const prompt = modeSystemPrompt("You are Proxima.", "coding");
    expect(prompt.startsWith("You are Proxima.")).toBe(true);
    expect(prompt).toContain(MODE_CONFIG.coding.guidance);
    expect(prompt.trim().endsWith(MODE_CONFIG.coding.guidance.trim())).toBe(true);
    // Every mode has its own, non-empty guidance.
    for (const mode of CHAT_MODES) expect(MODE_CONFIG[mode].guidance.length).toBeGreaterThan(40);
  });

  it("gives fast mode less room and no private thinking", () => {
    const fast = modeModelSettings("fast");
    expect(fast.thinking).toBe(false);
    expect(fast.maxTokens).toBe(1024);
    expect(fast.historyLimit).toBeLessThan(modeModelSettings("thinking").historyLimit);
    expect(modeModelSettings("thinking").thinking).toBe(true);
    expect(modeModelSettings("coding").thinking).toBe(true);
  });

  it("gives coding mode room for a complete file, not a snippet", () => {
    // Private reasoning counts against max_tokens, so this is deliberately
    // larger than a one-file snippet needs.
    expect(modeModelSettings("coding").maxTokens).toBeGreaterThanOrEqual(16_384);
    expect(MODE_CONFIG.coding.guidance).toContain('no "…"');
    expect(MODE_CONFIG.coding.guidance).toContain("every bracket closed");
  });

  it("never exceeds the environment's token ceiling", () => {
    expect(modeModelSettings("coding", 2048).maxTokens).toBe(2048);
    expect(modeModelSettings("fast", 8000).maxTokens).toBe(1024);
    // A tiny ceiling still leaves enough for a real answer.
    expect(modeModelSettings("fast", 10).maxTokens).toBe(256);
  });
});
