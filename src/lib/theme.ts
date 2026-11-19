/**
 * Theme helpers shared by the server (inline script) and the browser.
 *
 * Preference values:
 *   "dark"   – always dark (PROXIMA default, matches the original design)
 *   "light"  – always light
 *   "system" – follow the phone / computer setting
 */
export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "proxima-theme";
export const DEFAULT_THEME: ThemePreference = "dark";
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#050505",
  light: "#f8fafc",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

/**
 * Runs in <head> BEFORE the page paints, so the correct theme shows on the
 * very first frame (no white flash). Keep it tiny and dependency-free.
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)},p=localStorage.getItem(k);if(p!=="dark"&&p!=="light"&&p!=="system")p=${JSON.stringify(
  DEFAULT_THEME,
)};var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(THEME_COLORS.light)});}catch(e){document.documentElement.classList.add("dark")}})();`;
