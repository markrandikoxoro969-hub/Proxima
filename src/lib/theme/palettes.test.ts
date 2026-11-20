import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex } from "@/lib/color";
import {
  CUSTOM_THEME_LIMIT,
  DEFAULT_THEME_FOR_MODE,
  THEME_PALETTES,
  THEME_TOKEN_KEYS,
  buildCustomTheme,
  buildThemeCss,
  customThemeColors,
  isBuiltInThemeId,
  normalizeCustomThemes,
  resolveTheme,
  themeMetaColor,
  themesForMode,
  twinThemeId,
} from "./palettes";

const contrast = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

describe("built-in themes", () => {
  it("has a unique id for each theme", () => {
    const ids = THEME_PALETTES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults exist for both modes", () => {
    expect(THEME_PALETTES.some((theme) => theme.id === DEFAULT_THEME_FOR_MODE.dark)).toBe(true);
    expect(THEME_PALETTES.some((theme) => theme.id === DEFAULT_THEME_FOR_MODE.light)).toBe(true);
  });

  it("keeps text readable on every background (WCAG AA)", () => {
    for (const theme of THEME_PALETTES) {
      expect(contrast(theme.tokens.fg, theme.tokens.bg), `${theme.id} body text`).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.tokens.muted, theme.tokens.bg), `${theme.id} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.tokens.subtle, theme.tokens.bg), `${theme.id} subtle`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(theme.tokens.accentText, theme.tokens.bg), `${theme.id} accent text`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("defines every colour the app uses", () => {
    for (const theme of THEME_PALETTES) {
      for (const key of THEME_TOKEN_KEYS) {
        expect(theme.tokens[key], `${theme.id}.${key}`).toBeTruthy();
        expect(String(theme.tokens[key])).not.toContain("undefined");
      }
    }
  });

  it("pairs twins with the opposite mode", () => {
    for (const theme of THEME_PALETTES) {
      if (!theme.twin) continue;
      const twin = THEME_PALETTES.find((candidate) => candidate.id === theme.twin);
      expect(twin, `${theme.id} twin`).toBeDefined();
      expect(twin!.mode).not.toBe(theme.mode);
    }
  });

  it("splits themes by mode", () => {
    expect(themesForMode("dark").every((theme) => theme.mode === "dark")).toBe(true);
    expect(themesForMode("light").every((theme) => theme.mode === "light")).toBe(true);
    expect(themesForMode("dark").length + themesForMode("light").length).toBe(THEME_PALETTES.length);
  });
});

describe("theme selection", () => {
  it("keeps a theme whose mode matches", () => {
    expect(resolveTheme("midnight", "dark").id).toBe("midnight");
    expect(resolveTheme("paper", "light").id).toBe("paper");
  });

  it("uses the twin when the mode is switched", () => {
    expect(resolveTheme("midnight", "light").id).toBe("ocean");
    expect(resolveTheme("ocean", "dark").id).toBe("midnight");
  });

  it("falls back to the default for the mode", () => {
    expect(resolveTheme("nonsense", "light").id).toBe(DEFAULT_THEME_FOR_MODE.light);
    expect(resolveTheme(null, "dark").id).toBe(DEFAULT_THEME_FOR_MODE.dark);
    // aurora has no twin, so light mode gets the light default.
    expect(resolveTheme("aurora", "light").id).toBe(DEFAULT_THEME_FOR_MODE.light);
  });

  it("knows the twin to switch to with the sun/moon button", () => {
    const midnight = THEME_PALETTES.find((theme) => theme.id === "midnight")!;
    expect(twinThemeId(midnight, "light")).toBe("ocean");
    const aurora = THEME_PALETTES.find((theme) => theme.id === "aurora")!;
    expect(twinThemeId(aurora, "light")).toBe(DEFAULT_THEME_FOR_MODE.light);
  });

  it("uses the theme background as the browser/status-bar colour", () => {
    const theme = THEME_PALETTES[0];
    expect(themeMetaColor(theme)).toBe(theme.tokens.bg);
  });
});

describe("generated style sheet", () => {
  const css = buildThemeCss();

  it("has one rule per theme", () => {
    for (const theme of THEME_PALETTES) {
      expect(css).toContain(`:root[data-theme="${theme.id}"]`);
    }
    expect(css).toContain("--accent:");
    expect(css).toContain("color-scheme:dark");
    expect(css).not.toContain("undefined");
  });

  it("beats the fallback colours in globals.css", () => {
    // html.dark is (0,1,1); :root[data-theme=…] is (0,2,0).
    expect(css).toMatch(/:root\[data-theme="proxima"\]/);
  });
});

describe("custom themes", () => {
  const base = {
    name: "  My  Theme ",
    mode: "dark" as const,
    colors: { bg: "#101418", fg: "#e8f0ff", accent: "#22d3ee" },
  };

  it("builds all colours from the three picked", () => {
    const theme = buildCustomTheme(base);
    expect(theme.name).toBe("My Theme");
    expect(theme.custom).toBe(true);
    expect(theme.id).toMatch(/^custom-/);
    expect(theme.tokens.bg).toBe("#101418");
    expect(theme.tokens.accent).toBe("#22d3ee");
    expect(theme.tokens.inverseBg).toBe("#e8f0ff");
    expect(theme.tokens.line).toContain("rgb(");
    expect(customThemeColors(theme)).toEqual({ bg: "#101418", fg: "#e8f0ff", accent: "#22d3ee" });
  });

  it("guarantees readable small print", () => {
    const theme = buildCustomTheme({ ...base, colors: { ...base.colors, fg: "#8a8a8a" } });
    expect(contrast(theme.tokens.muted, theme.tokens.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("refuses themes nobody could read", () => {
    expect(() =>
      buildCustomTheme({ ...base, colors: { bg: "#222222", fg: "#333333", accent: "#22d3ee" } }),
    ).toThrow(/contrast/i);
    expect(() =>
      buildCustomTheme({ ...base, colors: { bg: "chartreuse", fg: "#fff", accent: "#000" } }),
    ).toThrow(/background, a text colour/i);
    expect(() => buildCustomTheme({ ...base, colors: { ...base.colors, accent: "#111111" } })).toThrow(
      /accent/i,
    );
  });

  it("keeps an existing id when editing", () => {
    const theme = buildCustomTheme({ ...base, id: "custom-abcdef123" });
    expect(theme.id).toBe("custom-abcdef123");
  });

  it("ignores forged tokens from the browser", () => {
    const forged = {
      ...base,
      tokens: { bg: "#ffffff", fg: "#000000" },
    } as unknown as Parameters<typeof buildCustomTheme>[0];
    const theme = buildCustomTheme(forged);
    expect(theme.tokens.bg).toBe("#101418");
  });

  it("cleans and limits stored theme lists", () => {
    const good = buildCustomTheme(base);
    const stored = [good, good, { nonsense: true }, { ...base, name: "Second" }, { ...base, name: "Third" }];
    const cleaned = normalizeCustomThemes(stored);
    expect(cleaned.length).toBeLessThanOrEqual(CUSTOM_THEME_LIMIT);
    expect(cleaned[0].id).toBe(good.id);
    expect(cleaned.filter((theme) => theme.id === good.id)).toHaveLength(1);
    // Stored objects are rebuilt, so names survive but tokens can't be forged.
    expect(cleaned[1].name).toBe("Second");
  });

  it("treats unknown ids as not built-in", () => {
    expect(isBuiltInThemeId("proxima")).toBe(true);
    expect(isBuiltInThemeId("custom-abc123def")).toBe(false);
  });
});
