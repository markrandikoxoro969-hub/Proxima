import { beforeEach, describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme, THEME_STORAGE_KEY, themeInitScript } from "./theme";

describe("theme helpers", () => {
  it("accepts only known preferences", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves system preference using the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("theme init script (runs before paint)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults to dark when nothing is stored", () => {
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies a stored light preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it('marks the page as "js" so scroll-reveal CSS only hides things when scripts run', () => {
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("js")).toBe(true);
  });

  it("ignores garbage values safely", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    new Function(themeInitScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
