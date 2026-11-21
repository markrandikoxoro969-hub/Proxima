/**
 * The public, app-owned Skills catalog. These fields follow the Agent Skills
 * metadata shape (`name`, `description`, and `compatibility`); the chat
 * runtime adds PROXIMA-specific permission checks. Instructions and execution
 * policy live on the server in `runtime.ts` and are never accepted from the browser.
 */
export const SKILL_CATEGORIES = [
  "Coding Assistant",
  "Web Research",
  "Writing Assistant",
  "Mathematics",
  "Data Analysis",
  "Document Assistant",
  "Productivity",
  "Creative Assistant",
  "Image Understanding",
  "Developer Tools",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_CATALOG = [
  {
    id: "coding-assistant",
    name: "coding-assistant",
    displayName: "Coding assistant",
    category: "Coding Assistant",
    description: "Plan, write, explain, and review practical code with careful attention to edge cases.",
    summary: "Useful code, clear reasoning, fewer surprises.",
    icon: "code",
    whatItDoes: [
      "Produces complete, idiomatic examples",
      "Reviews code for bugs and edge cases",
      "Explains errors and suggests focused fixes",
    ],
    compatibility: "Works in text conversations and with text or code files attached to the chat.",
    permissions: ["Read conversation text and attached text files", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "web-research",
    name: "web-research",
    displayName: "Web research",
    category: "Web Research",
    description:
      "Evaluate sources you provide, separate evidence from assumptions, and surface what still needs checking.",
    summary: "Source-aware research—without pretending to browse.",
    icon: "globe",
    whatItDoes: [
      "Compares supplied sources and claims",
      "Calls out dates, gaps, and conflicting evidence",
      "Suggests focused follow-up searches",
    ],
    compatibility: "Uses only source text and links you provide; this skill does not browse the live web.",
    permissions: ["Read conversation text and attached text files", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "writing-assistant",
    name: "writing-assistant",
    displayName: "Writing assistant",
    category: "Writing Assistant",
    description: "Shape drafts for clarity, tone, and audience while keeping the writer's intent intact.",
    summary: "Make the message clearer without losing your voice.",
    icon: "writing",
    whatItDoes: [
      "Edits for structure, clarity, and tone",
      "Adapts copy for a named audience",
      "Offers concise alternatives when useful",
    ],
    compatibility: "Works with text pasted into the conversation or text files attached to the chat.",
    permissions: ["Read conversation text and attached text files", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "mathematics",
    name: "mathematics",
    displayName: "Mathematics",
    category: "Mathematics",
    description: "Solve quantitative questions step by step, check units, and make assumptions explicit.",
    summary: "Careful calculations with a checkable result.",
    icon: "math",
    whatItDoes: [
      "Shows a compact derivation",
      "Checks units, signs, and boundary cases",
      "Labels estimates and assumptions",
    ],
    compatibility: "Works in text conversations; no external calculator or code execution is used.",
    permissions: ["Read conversation text", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "data-analysis",
    name: "data-analysis",
    displayName: "Data analysis",
    category: "Data Analysis",
    description: "Help interpret data you share, identify patterns, and make limitations visible.",
    summary: "Turn shared data into useful, careful takeaways.",
    icon: "chart",
    whatItDoes: [
      "Summarizes tables and pasted datasets",
      "Checks definitions, outliers, and missing values",
      "Suggests reproducible analysis steps",
    ],
    compatibility: "Works with pasted data and supported text or code attachments; it does not execute code.",
    permissions: ["Read conversation text and attached text files", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "document-assistant",
    name: "document-assistant",
    displayName: "Document assistant",
    category: "Document Assistant",
    description: "Extract key points, compare passages, and turn long text into a useful brief.",
    summary: "A clearer view of the documents you share.",
    icon: "document",
    whatItDoes: [
      "Summarizes supplied text with important details",
      "Finds differences between excerpts",
      "Creates outlines, briefs, and action lists",
    ],
    compatibility:
      "Works with pasted text and supported text files; PDF and office-file parsing is not included.",
    permissions: ["Read conversation text and attached text files", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "productivity",
    name: "productivity",
    displayName: "Productivity",
    category: "Productivity",
    description: "Turn a goal or messy task list into a realistic, prioritized next step.",
    summary: "Make the next step feel manageable.",
    icon: "productivity",
    whatItDoes: [
      "Breaks goals into clear next actions",
      "Prioritizes work with stated constraints",
      "Drafts checklists and time blocks",
    ],
    compatibility: "Creates plans in the chat; it cannot access calendars, tasks, or external accounts.",
    permissions: ["Read conversation text", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "creative-assistant",
    name: "creative-assistant",
    displayName: "Creative assistant",
    category: "Creative Assistant",
    description: "Explore ideas, concepts, and variations while keeping the brief and constraints in view.",
    summary: "Fresh directions, still grounded in your brief.",
    icon: "creative",
    whatItDoes: [
      "Generates distinct directions instead of near-duplicates",
      "Connects ideas to your audience and constraints",
      "Helps refine a selected concept",
    ],
    compatibility: "Works in text conversations. Use Image Studio separately to create or edit images.",
    permissions: ["Read conversation text", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "image-understanding",
    name: "image-understanding",
    displayName: "Image understanding",
    category: "Image Understanding",
    description:
      "Describe and reason about images attached to your message, without guessing at unseen details.",
    summary: "Thoughtful image analysis when vision is available.",
    icon: "image",
    whatItDoes: [
      "Describes visible objects and layout",
      "Reads legible text and visual patterns",
      "Separates observations from uncertain interpretations",
    ],
    compatibility:
      "Requires an image attachment and a configured vision-capable AI provider; otherwise the assistant will say it cannot see the image.",
    permissions: ["Read conversation text and images attached to this message", "Compose a response"],
    allowedTools: [],
  },
  {
    id: "developer-tools",
    name: "developer-tools",
    displayName: "Developer tools",
    category: "Developer Tools",
    description: "Make stack traces, API behavior, and technical notes easier to diagnose and act on.",
    summary: "Focused debugging and technical explanations.",
    icon: "wrench",
    whatItDoes: [
      "Explains stack traces and error messages",
      "Traces likely causes from supplied context",
      "Recommends low-risk diagnostic steps",
    ],
    compatibility:
      "Works with technical text and code attachments; it does not access a shell, repository, or live services.",
    permissions: ["Read conversation text and attached text files", "Compose a response"],
    allowedTools: [],
  },
] as const satisfies readonly SkillCatalogItem[];

export type SkillId = (typeof SKILL_CATALOG)[number]["id"];

export type SkillCatalogItem = {
  /** Agent Skills-compatible slug; this also serves as PROXIMA's stable id. */
  id: string;
  name: string;
  displayName: string;
  category: SkillCategory;
  description: string;
  summary: string;
  icon:
    | "code"
    | "globe"
    | "writing"
    | "math"
    | "chart"
    | "document"
    | "productivity"
    | "creative"
    | "image"
    | "wrench";
  whatItDoes: readonly string[];
  compatibility: string;
  /** App-level scope, not arbitrary shell or network permissions. */
  permissions: readonly string[];
  /** PROXIMA currently provides no executable skill tools. */
  allowedTools: readonly string[];
};

export type SkillState = Omit<SkillCatalogItem, "id"> & {
  id: SkillId;
  installed: boolean;
  enabled: boolean;
};

export const SKILL_IDS = SKILL_CATALOG.map((skill) => skill.id) as [SkillId, ...SkillId[]];

const SKILL_BY_ID = new Map<string, SkillCatalogItem>(SKILL_CATALOG.map((skill) => [skill.id, skill]));

export function getSkillById(id: string): SkillCatalogItem | undefined {
  return SKILL_BY_ID.get(id);
}

export function buildSkillState(installed: readonly { skillId: string; enabled: boolean }[]): SkillState[] {
  const statusById = new Map(installed.map((item) => [item.skillId, item.enabled]));
  return SKILL_CATALOG.map((skill) => {
    const hasSkill = statusById.has(skill.id);
    return { ...skill, installed: hasSkill, enabled: hasSkill && statusById.get(skill.id) === true };
  });
}

export type EnabledSkillSummary = {
  id: SkillId;
  displayName: string;
  description: string;
  category: SkillCategory;
  icon: SkillCatalogItem["icon"];
};

export function getEnabledSkillSummaries(
  installed: readonly { skillId: string; enabled: boolean }[],
): EnabledSkillSummary[] {
  const enabledIds = new Set(installed.filter((item) => item.enabled).map((item) => item.skillId));
  return SKILL_CATALOG.filter((skill) => enabledIds.has(skill.id)).map(
    ({ id, displayName, description, category, icon }) => ({
      id,
      displayName,
      description,
      category,
      icon,
    }),
  );
}
