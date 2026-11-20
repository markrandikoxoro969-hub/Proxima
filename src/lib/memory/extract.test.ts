import { describe, expect, it } from "vitest";
import { expandMemoryTerms, extractMemories, isWorthRemembering, memoryBlock, memoryKey } from "./extract";

const NOW = new Date("2026-11-20T00:00:00.000Z");

describe("memory extraction", () => {
  it("keeps short first-person durable goals and categorises them", () => {
    expect(extractMemories("I'm training for a half marathon.", NOW)).toEqual([
      { text: "training for a half marathon", category: "fitness", expiresAt: null },
    ]);
  });

  it("does not turn questions, small talk, or assistant-directed questions into memories", () => {
    expect(extractMemories("Which protein is good for the gym?", NOW)).toEqual([]);
    expect(extractMemories("Thanks, that was helpful!", NOW)).toEqual([]);
    expect(extractMemories("Do you like running?", NOW)).toEqual([]);
  });

  it("skips sensitive facts and secrets unless the user explicitly asks to remember them", () => {
    expect(extractMemories("My password is hunter2", NOW)).toEqual([]);
    expect(extractMemories("My home address is 12 Main Street", NOW)).toEqual([]);
    expect(extractMemories("My address is 12 Main Street", NOW)).toEqual([]);
    expect(extractMemories("My national ID number is 123456", NOW)).toEqual([]);
    expect(extractMemories("I was diagnosed with diabetes", NOW)).toEqual([]);
    expect(extractMemories("Remember this: my password is hunter2", NOW)).toHaveLength(1);
  });

  it("does not store details about other people unless explicitly requested", () => {
    expect(extractMemories("My sister works night shifts.", NOW)).toEqual([]);
    expect(extractMemories("Remember this: my sister works night shifts.", NOW)).toHaveLength(1);
  });

  it("expires time-bound facts and keeps durable facts", () => {
    const [temporary] = extractMemories("I have an exam this week", NOW);
    const [durable] = extractMemories("I work night shifts", NOW);
    expect(temporary?.expiresAt?.toISOString()).toBe("2026-11-28T00:00:00.000Z");
    expect(durable?.expiresAt).toBeNull();
  });

  it("deduplicates equivalent facts in a single message", () => {
    expect(extractMemories("I like running. I like running!", NOW)).toHaveLength(1);
    expect(memoryKey("Going to the gym!")).toBe("going to the gym");
  });

  it("says nothing in the prompt when no memories match, and gives the model careful use rules", () => {
    expect(memoryBlock([])).toBe("");
    const block = memoryBlock([{ text: "training for a half marathon", category: "fitness" }], NOW);
    expect(block).toContain("Today is 2026-11-20.");
    expect(block).toContain("Use at most one");
    expect(block).toContain("ask one short question first");
    expect(block).toContain("untrusted user data");
  });

  it("links a protein question to a gym memory, but keeps the expansion small and explicit", () => {
    expect(expandMemoryTerms(["protein"])).toContain("gym");
    expect(expandMemoryTerms(["mortgage"])).toEqual(["mortgage"]);
  });

  it("only spends extraction work on messages that mention the person", () => {
    expect(isWorthRemembering("I prefer short answers")).toBe(true);
    expect(isWorthRemembering("Tell me about running")).toBe(false);
  });
});
