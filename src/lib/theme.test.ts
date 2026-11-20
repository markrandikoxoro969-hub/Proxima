import { beforeEach, describe, expect, it } from "vitest";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  isThemePreference,
  readThemeFromStorage,
  resolveThemePreference,
  themeInitScript,
  writeStoredCustomThemes,
  writeStoredPaletteId,
} from "./theme";
import { buildCustomTheme } from "./theme/palettes";

describe("theme helpers", () => {
  it("accepts only known preferences", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves system preference using the OS setting", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
    expect(resolveThemePreference("light", true)).toBe("light");
  });
});

describe("theme init script (runs before paint)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
  });

  it("defaults to the Proxima dark theme when nothing is stored", () => {
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("proxima");
  });

  it("applies a stored light preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("daylight");
  });

  it("applies a stored theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    localStorage.setItem(PALETTE_STORAGE_KEY, "midnight");
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("midnight");
  });

  it("falls back to the default when the stored theme belongs to the other mode", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    localStorage.setItem(PALETTE_STORAGE_KEY, "aurora"); // dark only
    new Function(themeInitScript)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("daylight");
  });

  it("paints a custom theme before React loads", () => {
    const custom = buildCustomTheme({
      name: "Mine",
      mode: "dark",
      colors: { bg: "#101418", fg: "#e8f0ff", accent: "#22d3ee" },
    });
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    writeStoredPaletteId(custom.id);
    writeStoredCustomThemes([custom]);

    new Function(themeInitScript)();

    expect(document.documentElement.getAttribute("data-theme")).toBe(custom.id);
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#101418");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#22d3ee");
  });

  it('marks the page as "js" so scroll-reveal CSS only hides things when scripts run', () => {
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("js")).toBe(true);
  });

  it("ignores garbage values safely", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    localStorage.setItem(PALETTE_STORAGE_KEY, "not-a-theme");
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, "not json");
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("proxima");
  });
});

describe("applyThemeToDocument", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("swaps custom inline colours for a built-in theme", () => {
    const custom = buildCustomTheme({
      name: "Mine",
      mode: "dark",
      colors: { bg: "#101418", fg: "#e8f0ff", accent: "#22d3ee" },
    });
    applyThemeToDocument(custom, "dark");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#101418");

    const builtIn = readThemeFromStorage(true).theme;
    expect(builtIn.id).toBe("proxima"); // nothing stored → default
    applyThemeToDocument(builtIn, "dark");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
