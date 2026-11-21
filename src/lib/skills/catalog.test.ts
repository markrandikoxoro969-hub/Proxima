import { describe, expect, it } from "vitest";
import { SKILL_CATALOG, SKILL_CATEGORIES, buildSkillState, getSelectedSkillSummaries } from "./catalog";
import { skillSelectionSchema } from "./validation";

describe("built-in skill catalog", () => {
  it("has unique Agent Skills-style names and complete user-facing metadata", () => {
    expect(SKILL_CATEGORIES).toHaveLength(10);
    expect(SKILL_CATALOG).toHaveLength(10);
    expect(new Set(SKILL_CATALOG.map((skill) => skill.id)).size).toBe(SKILL_CATALOG.length);

    for (const skill of SKILL_CATALOG) {
      expect(skill.name).toBe(skill.id);
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.description.trim().length).toBeGreaterThan(24);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
      expect(skill.compatibility.length).toBeLessThanOrEqual(500);
      expect(skill.whatItDoes.length).toBeGreaterThan(0);
      expect(skill.permissions.length).toBeGreaterThan(0);
      expect(skill.allowedTools).toEqual([]);
    }
  });

  it("derives installed and enabled states from each user's own rows", () => {
    const skills = buildSkillState([
      { skillId: "coding-assistant", enabled: false, selected: true },
      { skillId: "web-research", enabled: true, selected: true },
      { skillId: "writing-assistant", enabled: true, selected: false },
      { skillId: "not-in-catalog", enabled: true, selected: true },
    ]);

    expect(skills.find((skill) => skill.id === "coding-assistant")).toMatchObject({
      installed: true,
      enabled: false,
      selected: false,
    });
    expect(skills.find((skill) => skill.id === "web-research")).toMatchObject({
      installed: true,
      enabled: true,
      selected: true,
    });
    expect(skills.find((skill) => skill.id === "mathematics")).toMatchObject({
      installed: false,
      enabled: false,
      selected: false,
    });
    expect(
      getSelectedSkillSummaries([
        { skillId: "coding-assistant", enabled: true, selected: false },
        { skillId: "web-research", enabled: true, selected: true },
        { skillId: "writing-assistant", enabled: false, selected: true },
      ]),
    ).toMatchObject([{ id: "web-research" }]);
  });
});

describe("skill selection validation", () => {
  it("accepts only unique, catalogued skill ids within the Settings selection limit", () => {
    expect(skillSelectionSchema.safeParse(["coding-assistant", "writing-assistant"]).success).toBe(true);
    expect(skillSelectionSchema.safeParse(["coding-assistant", "coding-assistant"]).success).toBe(false);
    expect(skillSelectionSchema.safeParse(["unknown-skill"]).success).toBe(false);
    expect(
      skillSelectionSchema.safeParse(["coding-assistant", "writing-assistant", "mathematics", "productivity"])
        .success,
    ).toBe(false);
  });
});
