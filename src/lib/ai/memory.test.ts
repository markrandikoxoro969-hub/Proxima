// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  extractMemories,
  isWorthRemembering,
  MEMORY_MAX_LINES,
  memorySection,
  mergeMemory,
  parseMemory,
  withMemory,
} from "./memory";

const DAY = new Date("2026-11-19T09:00:00.000Z");
const LATER = new Date("2026-11-22T09:00:00.000Z");

describe("extractMemories", () => {
  it("keeps a first-person plan and drops the redundant '1 day ago'", () => {
    expect(extractMemories("1 day ago I'm going to gym", DAY)).toEqual([
      "2026-11-19: I'm going to gym",
    ]);
  });

  it("ignores questions, greetings and small talk", () => {
    expect(extractMemories("which protein is good?", DAY)).toEqual([]);
    expect(extractMemories("hey, how are you?", DAY)).toEqual([]);
    expect(extractMemories("thanks!", DAY)).toEqual([]);
    expect(extractMemories("", DAY)).toEqual([]);
  });

  it("never stores credentials or addresses", () => {
    expect(extractMemories("my password is hunter2", DAY)).toEqual([]);
    expect(extractMemories("my api key is sk-123", DAY)).toEqual([]);
    expect(extractMemories("I live at 12 Baker Street", DAY)).toEqual([]);
  });

  it("does not remember what was only attached to a message", () => {
    expect(extractMemories("[Attached file: notes.pdf] my project is due friday", DAY)).toEqual([
      "2026-11-19: my project is due friday",
    ]);
  });

  it("ignores links and code", () => {
    expect(extractMemories("my site is https://example.com", DAY)).toEqual([]);
  });

  it("keeps several facts from one message", () => {
    const facts = extractMemories("I'm 24 and my name is Sujan. I study physics.", DAY);
    expect(facts).toHaveLength(2);
    expect(facts.join(" ")).toContain("my name is Sujan");
    expect(facts.join(" ")).toContain("I study physics");
  });
});

describe("mergeMemory", () => {
  it("puts the newest note first and keeps the old ones", () => {
    const first = mergeMemory(null, extractMemories("I'm going to gym", DAY));
    const second = mergeMemory(first, extractMemories("my name is Sujan", LATER));
    expect(second.split("\n")).toEqual([
      "- 2026-11-22: my name is Sujan",
      "- 2026-11-19: I'm going to gym",
    ]);
  });

  it("refreshes a repeated note instead of duplicating it", () => {
    const first = mergeMemory(null, extractMemories("I'm going to gym", DAY));
    const again = mergeMemory(first, ["2026-11-22: I'm going to gym"]);
    expect(parseMemory(again)).toEqual([{ date: "2026-11-22", text: "I'm going to gym" }]);
  });

  it("returns the existing notes when there is nothing new", () => {
    expect(mergeMemory("- 2026-11-19: I'm going to gym", [])).toBe("- 2026-11-19: I'm going to gym");
  });

  it("caps the list", () => {
    let notes: string | null = null;
    for (let i = 0; i < MEMORY_MAX_LINES + 6; i += 1) notes = mergeMemory(notes, [`2026-11-19: fact ${i}`]);
    expect(parseMemory(notes)).toHaveLength(MEMORY_MAX_LINES);
    // The newest survives, the oldest is the one dropped.
    expect(notes).toContain(`fact ${MEMORY_MAX_LINES + 5}`);
    expect(notes).not.toContain("fact 0\n");
  });
});

describe("memorySection / withMemory", () => {
  it("is empty when nothing is remembered", () => {
    expect(memorySection(null, LATER)).toBe("");
    expect(withMemory("BASE", "   ", LATER)).toBe("BASE");
  });

  it("tells the model the date of each memory and today's date", () => {
    const section = memorySection("- 2026-11-19: going to gym", LATER);
    expect(section).toContain("2026-11-19: going to gym");
    expect(section).toContain("Today is 2026-11-22");
    expect(section).toContain("never invent a memory");
  });

  it("is appended to the system prompt without touching it", () => {
    const built = withMemory("BASE PROMPT", "- 2026-11-19: going to gym", LATER);
    expect(built.startsWith("BASE PROMPT\n\n")).toBe(true);
  });
});

describe("isWorthRemembering", () => {
  it("filters obvious non-facts cheaply", () => {
    expect(isWorthRemembering("which protein is good?")).toBe(false);
    expect(isWorthRemembering("my password is x")).toBe(false);
    expect(isWorthRemembering("I'm training for a marathon")).toBe(true);
  });
});
