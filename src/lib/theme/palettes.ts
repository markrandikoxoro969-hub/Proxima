/**
 * ─── PROXIMA themes ───
 *
 * A theme is a complete set of colours (background, text, accent, hairlines,
 * glass surfaces…). People can pick one of the built-in themes, or build their
 * own from three colours — everything else is worked out for them, so a custom
 * theme stays readable.
 *
 * This file is safe in the browser AND on the server:
 *   - the server turns it into the <style> block that paints the first frame
 *   - the browser uses it to preview a theme instantly when you click it
 *
 * Nothing here touches localStorage. That lives in src/lib/theme.ts.
 */
import {
  contrastRatio,
  ensureContrast,
  isHexColor,
  mix,
  parseHex,
  toHex,
  withAlpha,
  type Rgb,
} from "@/lib/color";

export type ThemeMode = "dark" | "light";

/** Every colour a theme defines. Keys become CSS variables (see THEME_TOKEN_VARS). */
export type ThemeTokens = {
  bg: string;
  fg: string;
  muted: string;
  subtle: string;
  line: string;
  lineStrong: string;
  surface: string;
  surfaceSolid: string;
  surfaceHover: string;
  glow: string;
  inverseBg: string;
  inverseFg: string;
  scrollbar: string;
  accent: string;
  accentSoft: string;
};

export type ThemeTokenKey = keyof ThemeTokens;

/** Token → CSS custom property. The whole app is painted through these. */
export const THEME_TOKEN_VARS: Record<ThemeTokenKey, string> = {
  bg: "--bg",
  fg: "--fg",
  muted: "--muted",
  subtle: "--subtle",
  line: "--line",
  lineStrong: "--line-strong",
  surface: "--surface",
  surfaceSolid: "--surface-solid",
  surfaceHover: "--surface-hover",
  glow: "--glow",
  inverseBg: "--inverse-bg",
  inverseFg: "--inverse-fg",
  scrollbar: "--scrollbar",
  accent: "--accent",
  accentSoft: "--accent-soft",
};

export const THEME_TOKEN_KEYS = Object.keys(THEME_TOKEN_VARS) as ThemeTokenKey[];

export type ThemePalette = {
  /** Built-in id ("midnight") or "custom-…" for themes made by a person. */
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  /** The matching theme in the other mode; the sun/moon button swaps to it. */
  twin?: string;
  /** Three colours for the picker card: background, surface, accent. */
  swatch: [string, string, string];
  tokens: ThemeTokens;
  /** True for themes created by the user (they can be deleted / edited). */
  custom?: boolean;
  /** The three colours a custom theme was built from (kept so it can be edited). */
  colors?: CustomThemeColors;
};

export const CUSTOM_THEME_PREFIX = "custom-";

/** How many themes one account may create. Keeps the profile payload small. */
export const CUSTOM_THEME_LIMIT = 4;

export const DEFAULT_THEME_FOR_MODE: Record<ThemeMode, string> = {
  dark: "proxima",
  light: "daylight",
};

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

type ThemeColors = { bg: string; fg: string; accent: string; solid?: string };

/**
 * Turns three colours into the full token set.
 * Muted/subtle text is nudged until it passes WCAG AA on the background, so no
 * theme (built-in or custom) can produce unreadable small print.
 */
export function deriveTokens(mode: ThemeMode, colors: ThemeColors): ThemeTokens {
  const bgRgb = parseHex(colors.bg)!;
  const fgRgb = parseHex(colors.fg)!;
  const accentRgb = parseHex(colors.accent)!;
  const solidRgb = colors.solid ? parseHex(colors.solid)! : mix(bgRgb, WHITE, mode === "dark" ? 0.03 : 0.7);
  const dark = mode === "dark";

  // Body copy stays comfortable to read (≈8.5:1 dark, ≈7:1 light, as the
  // original design system had); small labels only need AA (4.6:1).
  const muted = ensureContrast(mix(fgRgb, bgRgb, 0.32), bgRgb, dark ? 8.5 : 7, fgRgb);
  const subtle = ensureContrast(mix(fgRgb, bgRgb, 0.45), bgRgb, 4.6, fgRgb);

  return {
    bg: toHex(bgRgb),
    fg: toHex(fgRgb),
    muted: toHex(muted),
    subtle: toHex(subtle),
    line: withAlpha(fgRgb, dark ? 0.07 : 0.09),
    lineStrong: withAlpha(fgRgb, dark ? 0.16 : 0.18),
    surface: withAlpha(solidRgb, dark ? 0.62 : 0.72),
    surfaceSolid: toHex(solidRgb),
    surfaceHover: withAlpha(fgRgb, dark ? 0.06 : 0.05),
    glow: withAlpha(fgRgb, dark ? 0.1 : 0.08),
    inverseBg: toHex(fgRgb),
    inverseFg: toHex(bgRgb),
    scrollbar: withAlpha(fgRgb, dark ? 0.15 : 0.15),
    accent: toHex(accentRgb),
    accentSoft: withAlpha(accentRgb, dark ? 0.22 : 0.16),
  };
}

function theme(
  id: string,
  name: string,
  description: string,
  mode: ThemeMode,
  colors: ThemeColors,
  twin?: string,
): ThemePalette {
  const tokens = deriveTokens(mode, colors);
  return {
    id,
    name,
    description,
    mode,
    twin,
    swatch: [tokens.bg, tokens.surfaceSolid, tokens.accent],
    tokens,
  };
}

/**
 * The themes that ship with PROXIMA.
 *
 * `proxima` and `daylight` are the original look (the values below mirror the
 * design system in globals.css), so existing accounts see no change.
 */
export const THEME_PALETTES: readonly ThemePalette[] = [
  theme(
    "proxima",
    "Proxima",
    "The original: deep black with a violet light.",
    "dark",
    {
      bg: "#050505",
      fg: "#f8fafc",
      accent: "#a78bfa",
      solid: "#0b0b0c",
    },
    "daylight",
  ),
  theme(
    "daylight",
    "Daylight",
    "Clean white with the same violet light.",
    "light",
    {
      bg: "#f8fafc",
      fg: "#0f172a",
      accent: "#6d28d9",
    },
    "proxima",
  ),
  theme(
    "midnight",
    "Midnight",
    "Navy depth with an electric blue glow.",
    "dark",
    {
      bg: "#060b1a",
      fg: "#e8eefc",
      accent: "#60a5fa",
      solid: "#0b1224",
    },
    "ocean",
  ),
  theme(
    "ocean",
    "Ocean",
    "Cool daylight blue, easy on long reads.",
    "light",
    {
      bg: "#eef4fb",
      fg: "#0b2239",
      accent: "#0369a1",
    },
    "midnight",
  ),
  theme(
    "ember",
    "Ember",
    "Warm charcoal with a firelight accent.",
    "dark",
    {
      bg: "#120806",
      fg: "#fdf0e8",
      accent: "#fb923c",
      solid: "#1c0d09",
    },
    "paper",
  ),
  theme(
    "paper",
    "Paper",
    "A warm cream page, like a good book.",
    "light",
    {
      bg: "#f7f2e8",
      fg: "#221c14",
      accent: "#b45309",
      solid: "#fffdf8",
    },
    "ember",
  ),
  theme("aurora", "Aurora", "Forest black with a green northern light.", "dark", {
    bg: "#04120e",
    fg: "#e6fff5",
    accent: "#34d399",
    solid: "#071a14",
  }),
  theme("sakura", "Sakura", "Soft blossom pink for daylight.", "light", {
    bg: "#fdf1f5",
    fg: "#2b121c",
    accent: "#be185d",
    solid: "#fffafc",
  }),
  theme("graphite", "Graphite", "Pure monochrome. The quietest option.", "dark", {
    bg: "#0a0a0a",
    fg: "#f5f5f5",
    accent: "#a3a3a3",
    solid: "#141414",
  }),
  theme("neon", "Neon", "Near-black with a sharp lime edge.", "dark", {
    bg: "#050a05",
    fg: "#eaffef",
    accent: "#a3e635",
    solid: "#0a120a",
  }),
] as const;

const BUILT_IN_BY_ID = new Map(THEME_PALETTES.map((t) => [t.id, t]));

/** id → mode, used by the tiny pre-paint script in src/lib/theme.ts. */
export const BUILT_IN_THEME_MODES: Record<string, ThemeMode> = Object.fromEntries(
  THEME_PALETTES.map((t) => [t.id, t.mode]),
);

export const getBuiltInTheme = (id: string): ThemePalette | undefined => BUILT_IN_BY_ID.get(id);

export const themesForMode = (mode: ThemeMode): ThemePalette[] =>
  THEME_PALETTES.filter((t) => t.mode === mode);

export const isBuiltInThemeId = (id: unknown): id is string =>
  typeof id === "string" && BUILT_IN_BY_ID.has(id);

export const isCustomThemeId = (id: unknown): id is string =>
  typeof id === "string" && id.startsWith(CUSTOM_THEME_PREFIX);

/** Picks the theme to show. Falls back to the default when the id is unknown or the mode doesn't match. */
export function resolveTheme(
  id: string | null | undefined,
  mode: ThemeMode,
  customThemes: readonly ThemePalette[] = [],
): ThemePalette {
  const wanted = (id && (BUILT_IN_BY_ID.get(id) ?? customThemes.find((t) => t.id === id))) || undefined;
  if (wanted && wanted.mode === mode) return wanted;
  if (wanted?.twin) {
    const twin = BUILT_IN_BY_ID.get(wanted.twin) ?? customThemes.find((t) => t.id === wanted.twin);
    if (twin && twin.mode === mode) return twin;
  }
  return BUILT_IN_BY_ID.get(DEFAULT_THEME_FOR_MODE[mode])!;
}

/** The theme the sun/moon button switches to (same character in the other mode when possible). */
export function twinThemeId(theme: ThemePalette, mode: ThemeMode): string {
  if (theme.twin) {
    const twin = BUILT_IN_BY_ID.get(theme.twin);
    if (twin && twin.mode === mode) return twin.id;
  }
  return DEFAULT_THEME_FOR_MODE[mode];
}

/* ── The style sheet (built once per server start) ─────────────────── */

const cssVariables = (tokens: ThemeTokens): string =>
  THEME_TOKEN_KEYS.map((key) => `${THEME_TOKEN_VARS[key]}:${tokens[key]}`).join(";");

/**
 * CSS for every built-in theme. Custom themes are applied as inline styles on
 * <html> instead (they change without a rebuild).
 *
 * `:root[data-theme="…"]` is more specific than `html.dark`, so a theme wins
 * over the fallback colours in globals.css whatever the order of the tags.
 */
export function buildThemeCss(palettes: readonly ThemePalette[] = THEME_PALETTES): string {
  return (
    palettes
      .map(
        (palette) =>
          `:root[data-theme="${palette.id}"]{${cssVariables(palette.tokens)};color-scheme:${palette.mode}}`,
      )
      .join("\n") + "\n"
  );
}

/** The style sheet injected in <head> by app/layout.tsx. */
export const THEME_STYLE_ID = "proxima-theme-vars";
export const themeStyleSheet = buildThemeCss();

/** Inline variables for a theme (used for custom themes, and to preview one). */
export function cssPropertiesFor(theme: ThemePalette): Record<string, string> {
  const style: Record<string, string> = {};
  for (const key of THEME_TOKEN_KEYS) style[THEME_TOKEN_VARS[key]] = theme.tokens[key];
  return style;
}

/** The colour phones use for the status bar / browser chrome. */
export const themeMetaColor = (theme: ThemePalette): string => theme.tokens.bg;

/* ── Custom themes ─────────────────────────────────────────────────── */

export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

export type CustomThemeColors = { bg: string; fg: string; accent: string };
export type CustomThemeInput = {
  id?: string;
  name?: unknown;
  mode?: unknown;
  colors?: { bg?: unknown; fg?: unknown; accent?: unknown };
};

const NAME_MAX = 24;

/** Removes control characters and squeezes spaces — for names shown in the picker. */
function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

function newCustomThemeId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  return `${CUSTOM_THEME_PREFIX}${random}`;
}

/**
 * Validates a custom theme coming from a form (or from the database) and
 * rebuilds ALL of its colours from the three the person chose. Client-supplied
 * token maps are never trusted.
 */
export function buildCustomTheme(input: CustomThemeInput): ThemePalette {
  const name = cleanName(input.name) || "My theme";
  const mode = input.mode === "light" ? "light" : "dark";
  const colors = input.colors ?? {};

  const bg = typeof colors.bg === "string" ? colors.bg.trim() : "";
  const fg = typeof colors.fg === "string" ? colors.fg.trim() : "";
  const accent = typeof colors.accent === "string" ? colors.accent.trim() : "";
  if (!isHexColor(bg) || !isHexColor(fg) || !isHexColor(accent)) {
    throw new ThemeError("Pick a background, a text colour and an accent colour.");
  }

  const bgRgb = parseHex(bg)!;
  const fgRgb = parseHex(fg)!;
  const accentRgb = parseHex(accent)!;

  if (contrastRatio(fgRgb, bgRgb) < 4.5) {
    throw new ThemeError("Text and background are too similar — choose colours with more contrast.");
  }
  if (contrastRatio(accentRgb, bgRgb) < 2.5) {
    throw new ThemeError("That accent is too close to the background. Pick a brighter or darker one.");
  }

  const id =
    isCustomThemeId(input.id) && /^custom-[a-z0-9-]{6,40}$/.test(input.id) ? input.id : newCustomThemeId();

  const picked = { bg, fg, accent };
  const tokens = deriveTokens(mode, picked);
  return {
    id,
    name,
    description: "Your own theme",
    mode,
    swatch: [tokens.bg, tokens.surfaceSolid, tokens.accent],
    tokens,
    custom: true,
    colors: picked,
  };
}

/**
 * A stored custom theme → palette. Returns null for anything malformed.
 * Only the three source colours are kept from storage; every other colour is
 * rebuilt, so a hand-edited database row can't produce unreadable text.
 */
export function normalizeCustomTheme(value: unknown): ThemePalette | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const storedColors = (raw.colors ?? {}) as Record<string, unknown>;
  const tokens = (raw.tokens ?? {}) as Record<string, unknown>;
  const pick = (key: "bg" | "fg" | "accent") => {
    const fromColors = storedColors[key];
    if (typeof fromColors === "string") return fromColors;
    // Older rows may only have the derived colours.
    const fromTokens = tokens[key];
    return typeof fromTokens === "string" ? fromTokens : undefined;
  };
  try {
    return buildCustomTheme({
      id: typeof raw.id === "string" ? raw.id : undefined,
      name: raw.name,
      mode: raw.mode,
      colors: { bg: pick("bg") ?? "", fg: pick("fg") ?? "", accent: pick("accent") ?? "" },
    });
  } catch {
    return null;
  }
}

/** Cleans a list of custom themes (from the database or localStorage). */
export function normalizeCustomThemes(value: unknown, limit = CUSTOM_THEME_LIMIT): ThemePalette[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ThemePalette[] = [];
  for (const entry of value) {
    const themeValue = normalizeCustomTheme(entry);
    if (!themeValue || seen.has(themeValue.id)) continue;
    seen.add(themeValue.id);
    out.push(themeValue);
    if (out.length >= limit) break;
  }
  return out;
}

/** The three colours of a custom theme, for the editor's colour inputs. */
export function customThemeColors(theme: ThemePalette): CustomThemeColors {
  return theme.colors ?? { bg: theme.tokens.bg, fg: theme.tokens.fg, accent: theme.tokens.accent };
}

/** The shape the API expects when saving themes (only the three source colours). */
export function customThemePayload(theme: ThemePalette) {
  return { id: theme.id, name: theme.name, mode: theme.mode, colors: customThemeColors(theme) };
}
