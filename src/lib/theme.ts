/**
 * Theme helpers shared by the server (pre-paint script + stylesheet) and the browser.
 *
 * There are two separate choices, because they answer different questions:
 *   mode    – dark, light, or "follow the system"   (THEME_STORAGE_KEY)
 *   palette – WHICH theme, e.g. Midnight or Paper   (PALETTE_STORAGE_KEY)
 *
 * A palette belongs to a mode (Midnight is a dark theme), so picking a palette
 * also picks a mode. The sun/moon button keeps the character by switching to
 * the palette's "twin" when one exists (Midnight ⇄ Ocean).
 */
import {
  BUILT_IN_THEME_MODES,
  BUILT_IN_THEME_SCENES,
  DEFAULT_THEME_FOR_MODE,
  THEME_PALETTES,
  THEME_TOKEN_KEYS,
  THEME_TOKEN_VARS,
  cssPropertiesFor,
  normalizeCustomThemes,
  resolveTheme,
  themeMetaColor,
  type ThemeMode,
  type ThemePalette,
} from "./theme/palettes";

export * from "./theme/palettes";
export type { ThemeMode, ThemePalette };

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = ThemeMode;

export const THEME_STORAGE_KEY = "proxima-theme";
export const PALETTE_STORAGE_KEY = "proxima-palette";
export const CUSTOM_THEMES_STORAGE_KEY = "proxima-custom-themes";

export const DEFAULT_THEME: ThemePreference = "dark";

/** Status-bar colours for the original themes (used before any theme is applied). */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#050505",
  light: "#f8fafc",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

/** "dark" | "light" | "system" + the OS setting → the mode actually shown. */
export function resolveThemePreference(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

/* ── Reading and writing the two preferences ──────────────────────── */

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice still applies to this page view */
  }
}

export function readStoredPreference(): ThemePreference {
  const value = readString(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : DEFAULT_THEME;
}

export function readStoredPaletteId(): string | null {
  return readString(PALETTE_STORAGE_KEY);
}

/** Custom themes are mirrored into localStorage so they paint before the network answers. */
export function readStoredCustomThemes(): ThemePalette[] {
  const raw = readString(CUSTOM_THEMES_STORAGE_KEY);
  if (!raw) return [];
  try {
    return normalizeCustomThemes(JSON.parse(raw));
  } catch {
    return [];
  }
}

export const writeStoredPreference = (pref: ThemePreference) => writeString(THEME_STORAGE_KEY, pref);
export const writeStoredPaletteId = (id: string) => writeString(PALETTE_STORAGE_KEY, id);
export const writeStoredCustomThemes = (themes: readonly ThemePalette[]) =>
  writeString(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));

/* ── Applying a theme to the page ─────────────────────────────────── */

function setMetaThemeColor(color: string): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

/**
 * Paints `theme` on <html>. Custom themes are applied as inline CSS variables;
 * built-in themes are painted by the stylesheet (so every inline variable from
 * a previously previewed custom theme is removed first).
 */
export function applyThemeToDocument(theme: ThemePalette, resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.setAttribute("data-theme", theme.id);
  // Scene themes paint a slow light behind everything; others clear it.
  if (theme.scene) root.setAttribute("data-scene", theme.scene);
  else root.removeAttribute("data-scene");

  for (const key of THEME_TOKEN_KEYS) root.style.removeProperty(THEME_TOKEN_VARS[key]);
  if (theme.custom) {
    for (const [variable, value] of Object.entries(cssPropertiesFor(theme))) {
      root.style.setProperty(variable, value);
    }
  }
  setMetaThemeColor(themeMetaColor(theme));
}

/** Reads everything stored on this device and works out what to show. */
export function readThemeFromStorage(systemPrefersDark: boolean) {
  const preference = readStoredPreference();
  const resolved = resolveThemePreference(preference, systemPrefersDark);
  const customThemes = readStoredCustomThemes();
  const theme = resolveTheme(readStoredPaletteId(), resolved, customThemes);
  return { preference, resolved, customThemes, theme };
}

/* ── Pre-paint script ─────────────────────────────────────────────── */

/** id → twin id, so the tiny script can swap Midnight ⇄ Ocean without app code. */
const TWINS: Record<string, string> = Object.fromEntries(
  THEME_PALETTES.filter((theme) => theme.twin).map((theme) => [theme.id, theme.twin!]),
);

/**
 * Runs in <head> BEFORE the page paints. It adds class "js" (lets CSS hide
 * scroll-reveal content only when JavaScript works), then applies the saved
 * mode + palette, so there is no flash of the wrong colours.
 *
 * Keep it small and dependency-free: it ships inside every page.
 */
export const themeInitScript = `(function(){var d=document.documentElement;d.classList.add("js");try{
var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(m!=="dark"&&m!=="light"&&m!=="system")m=${JSON.stringify(DEFAULT_THEME)};
var dark=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var mode=dark?"dark":"light";
var modes=${JSON.stringify(BUILT_IN_THEME_MODES)},scenes=${JSON.stringify(BUILT_IN_THEME_SCENES)},twins=${JSON.stringify(TWINS)},
defaults=${JSON.stringify(DEFAULT_THEME_FOR_MODE)},vars=${JSON.stringify(THEME_TOKEN_VARS)};
var pid=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)})||"",custom=[];
try{custom=JSON.parse(localStorage.getItem(${JSON.stringify(CUSTOM_THEMES_STORAGE_KEY)})||"[]")||[]}catch(e){custom=[]}
function find(id){if(!id)return null;for(var i=0;i<custom.length;i++){var c=custom[i];if(c&&c.id===id&&(c.mode==="dark"||c.mode==="light")&&c.tokens)return c}
if(modes[id])return{id:id,mode:modes[id]};return null}
var t=find(pid);
if(!t||t.mode!==mode){var twin=t&&twinCheck(t);t=twin&&twin.mode===mode?twin:{id:defaults[mode],mode:mode}}
function twinCheck(x){return twins[x.id]?find(twins[x.id]):null}
d.classList.toggle("dark",mode==="dark");d.style.colorScheme=mode;d.setAttribute("data-theme",t.id);
if(scenes[t.id])d.setAttribute("data-scene",scenes[t.id]);else d.removeAttribute("data-scene");
for(var k in vars)d.style.removeProperty(vars[k]);
var color=null;
if(t.tokens&&t.mode===mode){for(var k2 in vars){var v=t.tokens[k2];if(typeof v==="string")d.style.setProperty(vars[k2],v)}color=typeof t.tokens.bg==="string"?t.tokens.bg:null}
if(!color){var s=getComputedStyle(d).getPropertyValue("--bg");color=s&&s.trim()?s.trim():(mode==="dark"?"#050505":"#f8fafc")}
var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",color);
}catch(e){document.documentElement.classList.add("dark")}})();`;
