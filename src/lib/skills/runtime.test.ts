import { describe, expect, it } from "vitest";
import { SKILL_CATALOG } from "./catalog";
import { skillPromptSection } from "./runtime";

describe("skill prompt boundary", () => {
  it("builds prompt context only from trusted, app-owned skill definitions", () => {
    const skill = SKILL_CATALOG.find((entry) => entry.id === "web-research");
    expect(skill).toBeDefined();
    if (!skill) return;

    const prompt = skillPromptSection([
      {
        ...skill,
        instructions: "Use only supplied sources and state when evidence is missing.",
      },
    ]);

    expect(prompt).toContain("Selected PROXIMA skills");
    expect(prompt).toContain("Web research");
    expect(prompt).toContain("Use only supplied sources");
    expect(prompt).toContain("No external tools are available");
    expect(prompt).not.toContain("https://");
  });

  it("adds no prompt content when the user did not select a skill", () => {
    expect(skillPromptSection([])).toBe("");
  });
});
