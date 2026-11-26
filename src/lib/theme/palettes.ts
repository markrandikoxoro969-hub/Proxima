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
  /** Accent text/icon colour that passes AA on the base background. */
  accentText: string;
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
  accentText: "--accent-text",
  accentSoft: "--accent-soft",
};

export const THEME_TOKEN_KEYS = Object.keys(THEME_TOKEN_VARS) as ThemeTokenKey[];

/** A painted or media-backed backdrop that belongs to a theme. */
export type ThemeScene = "sky" | "ocean" | "nature" | "media";

/** Optional ambient video or aesthetic photo backing a theme. */
export type ThemeMedia = {
  kind: "video" | "image";
  src: string;
  /** Lightweight animated WebP loop used on mobile phones to avoid video codec lag. */
  mobileSrc?: string;
  /** Standalone soundtrack so <video> stays purely muted/hardware-decoded and mobile loops keep music. */
  audioSrc?: string;
  /** Still frame shown immediately while video or mobile loop loads, or under reduced motion. */
  poster?: string;
  /** CSS object-position so key focal points stay nicely framed. */
  position?: string;
  /** Visibility of the underlying media over the solid theme background (0–1). */
  opacity?: number;
};

/** Which voice a theme uses. `site` = PROXIMA's normal Montserrat. */
export type ThemeDisplay = "geometric" | "rounded" | "site";

export type ThemePalette = {
  /** Built-in id ("midnight") or "custom-…" for themes made by a person. */
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  /** The matching theme in the other mode; the sun/moon button swaps to it. */
  twin?: string;
  /** Animated background painted by <ThemeBackdrop />. */
  scene?: ThemeScene;
  /** Ambient video or photo wallpaper painted by <ThemeBackdrop />. */
  media?: ThemeMedia;
  /** Body/heading voice for this theme. */
  display?: ThemeDisplay;
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
    // Keep the vivid accent for decoration, but use a separately derived
    // AA-safe token wherever the accent is actual text or an informative icon.
    accentText: toHex(ensureContrast(accentRgb, bgRgb, 4.6, fgRgb)),
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
  extra: { scene?: ThemeScene; display?: ThemeDisplay; media?: ThemeMedia } = {},
): ThemePalette {
  const tokens = deriveTokens(mode, colors);
  return {
    id,
    name,
    description,
    mode,
    twin,
    scene: extra.scene ?? (extra.media ? "media" : undefined),
    media: extra.media,
    display: extra.display,
    swatch: [tokens.bg, tokens.surfaceSolid, tokens.accent],
    tokens,
  };
}

/**
 * Font stacks per voice. Nothing is downloaded for these: Sky and Nature use the
 * Montserrat that is already loaded, Ocean asks the OS for a rounded face and
 * falls back to Montserrat where there isn't one. That keeps a theme switch at
 * zero network cost (see README → Themes for why no webfont file ships).
 */
export const THEME_FONT_STACKS: Record<ThemeDisplay, string> = {
  geometric: 'var(--font-montserrat), ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Quicksand", var(--font-montserrat), ui-sans-serif, system-ui, sans-serif',
  site: 'var(--font-montserrat), ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
};

/**
 * The themes that ship with PROXIMA.
 *
 * `proxima` and `daylight` are the default product palettes. The global CSS
 * values are fallbacks; this palette remains the source of truth when selected.
 */
export const THEME_PALETTES: readonly ThemePalette[] = [
  theme(
    "proxima",
    "Proxima",
    "Quiet charcoal with a soft violet accent.",
    "dark",
    {
      bg: "#0b0d12",
      fg: "#f4f6fa",
      accent: "#9b8cff",
      solid: "#11141b",
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
    { scene: "ocean", display: "rounded" },
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
  // ── Scene themes ────────────────────────────────────────────────────────
  // Each paints a slow background (components/theme/theme-backdrop.tsx) and
  // picks a voice. Contrast is derived by the same rules as every other theme,
  // so small print stays above 4.5:1.
  theme(
    "sky",
    "Sky",
    "Dawn light, drifting clouds and a soft sun.",
    "light",
    {
      bg: "#e9f4ff",
      fg: "#0a2540",
      accent: "#0284c7",
      solid: "#f8fcff",
    },
    "midnight",
    { scene: "sky", display: "geometric" },
  ),
  theme(
    "nature",
    "Nature",
    "Leaf light, floating pollen and a quiet, warm page.",
    "light",
    {
      bg: "#f2f7ee",
      fg: "#1b2a17",
      accent: "#3f7d20",
      solid: "#fbfdf8",
    },
    "aurora",
    { scene: "nature", display: "site" },
  ),
  // ── Aesthetic Media Themes (Live video & photo backdrops) ───────────────
  // Each pairs a curated motion video or aesthetic photo with an AA-safe
  // palette and a tinted readability scrim so chat text stays crisp.
  theme(
    "torn-veil",
    "Torn Veil",
    "Ink-black manga rift with luminous violet & cyan eyes.",
    "dark",
    {
      bg: "#07060d",
      fg: "#f4f3ff",
      accent: "#38e8ff",
      solid: "#11101d",
    },
    "blossom-sunbeam",
    {
      media: {
        kind: "video",
        src: "/media/themes/torn-veil.mp4",
        mobileSrc: "/media/themes/torn-veil-mobile.webp",
        audioSrc: "/media/themes/torn-veil.m4a",
        poster: "/media/themes/torn-veil.jpg",
        position: "50% 48%",
        opacity: 0.44,
      },
      display: "geometric",
    },
  ),
  theme(
    "crimson-velvet",
    "Crimson Velvet",
    "Bold burgundy studio motion with rose-velvet energy.",
    "dark",
    {
      bg: "#14060b",
      fg: "#fff1f5",
      accent: "#fb7185",
      solid: "#200b13",
    },
    "blossom-sunbeam",
    {
      media: {
        kind: "video",
        src: "/media/themes/crimson-velvet.mp4",
        mobileSrc: "/media/themes/crimson-velvet-mobile.webp",
        audioSrc: "/media/themes/crimson-velvet.m4a",
        poster: "/media/themes/crimson-velvet.jpg",
        position: "50% 50%",
        opacity: 0.38,
      },
      display: "geometric",
    },
  ),
  theme(
    "astral-eclipse",
    "Astral Eclipse",
    "Cinematic ember glow and sapphire-lit anime horizons.",
    "dark",
    {
      bg: "#080a14",
      fg: "#eef4ff",
      accent: "#f59e0b",
      solid: "#111526",
    },
    "azure-daydream",
    {
      media: {
        kind: "video",
        src: "/media/themes/astral-eclipse.mp4",
        mobileSrc: "/media/themes/astral-eclipse-mobile.webp",
        audioSrc: "/media/themes/astral-eclipse.m4a",
        poster: "/media/themes/astral-eclipse.jpg",
        position: "50% 45%",
        opacity: 0.38,
      },
      display: "geometric",
    },
  ),
  theme(
    "emerald-mirage",
    "Emerald Mirage",
    "Jade emerald studio motion with gilded highlights.",
    "dark",
    {
      bg: "#04110c",
      fg: "#ecfdf5",
      accent: "#34d399",
      solid: "#081c15",
    },
    "blossom-sunbeam",
    {
      media: {
        kind: "video",
        src: "/media/themes/emerald-mirage.mp4",
        mobileSrc: "/media/themes/emerald-mirage-mobile.webp",
        audioSrc: "/media/themes/emerald-mirage.m4a",
        poster: "/media/themes/emerald-mirage.jpg",
        position: "50% 45%",
        opacity: 0.44,
      },
      display: "geometric",
    },
  ),
  theme(
    "sapphire-stage",
    "Sapphire Stage",
    "Royal indigo spotlight and widescreen stage motion.",
    "dark",
    {
      bg: "#09081a",
      fg: "#eef2ff",
      accent: "#818cf8",
      solid: "#12102b",
    },
    "azure-daydream",
    {
      media: {
        kind: "video",
        src: "/media/themes/sapphire-stage.mp4",
        mobileSrc: "/media/themes/sapphire-stage-mobile.webp",
        audioSrc: "/media/themes/sapphire-stage.m4a",
        poster: "/media/themes/sapphire-stage.jpg",
        position: "50% 42%",
        opacity: 0.44,
      },
      display: "geometric",
    },
  ),
  theme(
    "cobalt-encore",
    "Cobalt Encore",
    "Electric violet-sapphire dance motion with crisp contrast.",
    "dark",
    {
      bg: "#070b18",
      fg: "#eff6ff",
      accent: "#60a5fa",
      solid: "#0e152b",
    },
    "azure-daydream",
    {
      media: {
        kind: "video",
        src: "/media/themes/cobalt-encore.mp4",
        mobileSrc: "/media/themes/cobalt-encore-mobile.webp",
        audioSrc: "/media/themes/cobalt-encore.m4a",
        poster: "/media/themes/cobalt-encore.jpg",
        position: "50% 32%",
        opacity: 0.42,
      },
      display: "geometric",
    },
  ),
  theme(
    "rose-gaze",
    "Rose Gaze",
    "Dreamy rose-quartz & amethyst anime gaze banner.",
    "dark",
    {
      bg: "#140810",
      fg: "#fdf2f8",
      accent: "#f472b6",
      solid: "#210e1a",
    },
    "blossom-sunbeam",
    {
      media: {
        kind: "image",
        src: "/media/themes/rose-gaze.jpg",
        poster: "/media/themes/rose-gaze.jpg",
        position: "50% 50%",
        opacity: 0.42,
      },
      display: "site",
    },
  ),
  theme(
    "night-drive",
    "Night Drive",
    "Late-night street glow, vintage teal steel and soft grain.",
    "dark",
    {
      bg: "#081112",
      fg: "#edf7f6",
      accent: "#2dd4bf",
      solid: "#101e20",
    },
    "azure-daydream",
    {
      media: {
        kind: "image",
        src: "/media/themes/night-drive.jpg",
        poster: "/media/themes/night-drive.jpg",
        position: "50% 34%",
        opacity: 0.44,
      },
      display: "site",
    },
  ),
  theme(
    "azure-daydream",
    "Azure Daydream",
    "Sunlit sky bokeh, drifting clouds and soft daylight.",
    "light",
    {
      bg: "#ebf7fc",
      fg: "#0a2238",
      accent: "#0284c7",
      solid: "#f7fcff",
    },
    "astral-eclipse",
    {
      media: {
        kind: "video",
        src: "/media/themes/azure-daydream.mp4",
        mobileSrc: "/media/themes/azure-daydream-mobile.webp",
        audioSrc: "/media/themes/azure-daydream.m4a",
        poster: "/media/themes/azure-daydream.jpg",
        position: "50% 38%",
        opacity: 0.38,
      },
      display: "rounded",
    },
  ),
  theme(
    "blossom-sunbeam",
    "Blossom Sunbeam",
    "Sakura bloom, rainbow lens flare and warm petal light.",
    "light",
    {
      bg: "#fdf3f6",
      fg: "#2b101b",
      accent: "#be185d",
      solid: "#fff9fb",
    },
    "torn-veil",
    {
      media: {
        kind: "video",
        src: "/media/themes/blossom-sunbeam.mp4",
        mobileSrc: "/media/themes/blossom-sunbeam-mobile.webp",
        audioSrc: "/media/themes/blossom-sunbeam.m4a",
        poster: "/media/themes/blossom-sunbeam.jpg",
        position: "50% 36%",
        opacity: 0.36,
      },
      display: "site",
    },
  ),
] as const;

/** Aesthetic themes backed by a live video or photo backdrop. */
export const MEDIA_THEMES: readonly ThemePalette[] = THEME_PALETTES.filter((t) => Boolean(t.media));

/** scene per built-in theme, for the pre-paint script and <html data-scene>. */
export const BUILT_IN_THEME_SCENES: Record<string, ThemeScene> = Object.fromEntries(
  THEME_PALETTES.filter((theme) => theme.scene).map((theme) => [theme.id, theme.scene!]),
);

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

/**
 * Colours + the theme's voice. `--font-body` on <body> and `--font-display` on
 * headings come from here, so a theme can change the typeface without any
 * component knowing about it.
 */
const cssVariables = (palette: ThemePalette): string => {
  const vars = THEME_TOKEN_KEYS.map((key) => `${THEME_TOKEN_VARS[key]}:${palette.tokens[key]}`);
  const stack = THEME_FONT_STACKS[palette.display ?? "site"];
  vars.push(`--font-body:${stack}`, `--font-display:${stack}`);
  return vars.join(";");
};

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
          `:root[data-theme="${palette.id}"]{${cssVariables(palette)};color-scheme:${palette.mode}}`,
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
  // Custom themes only choose colours, so they keep the standard voice.
  const stack = THEME_FONT_STACKS[theme.display ?? "site"];
  style["--font-body"] = stack;
  style["--font-display"] = stack;
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
