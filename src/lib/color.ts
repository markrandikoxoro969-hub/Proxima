/**
 * Tiny colour helpers (no dependencies, works in the browser and on the server).
 *
 * Themes are built from three colours the person picks — background, text and
 * accent — and everything else (muted text, hairlines, glass surfaces) is
 * derived from them here. That keeps every custom theme readable instead of
 * letting people create grey-on-grey text.
 */

export type Rgb = { r: number; g: number; b: number };

const clamp = (value: number, min = 0, max = 255) => Math.min(max, Math.max(min, Math.round(value)));

/** "#0a0a0a" / "#abc" / "#ABCDEF" → { r, g, b }. Null when it isn't a hex colour. */
export function parseHex(value: string): Rgb | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    if (!/^[0-9a-f]{3}$/i.test(hex)) return null;
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** { r, g, b } → "#0a0a0a" (always lower-case, always 6 digits). */
export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Mixes two colours: t = 0 returns `a`, t = 1 returns `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: clamp(a.r + (b.r - a.r) * k),
    g: clamp(a.g + (b.g - a.g) * k),
    b: clamp(a.b + (b.b - a.b) * k),
  };
}

/** CSS colour with transparency, e.g. `rgb(248 250 252 / 0.68)`. */
export function withAlpha(color: Rgb, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  return `rgb(${clamp(color.r)} ${clamp(color.g)} ${clamp(color.b)} / ${Number(a.toFixed(3))})`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) → 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Moves `color` towards `toward` (usually the text colour) until it is at
 * least `minRatio` readable on `surface`. Used for muted text, so a theme with
 * a muddy accent can never produce unreadable small print.
 */
export function ensureContrast(color: Rgb, surface: Rgb, minRatio: number, toward: Rgb = color): Rgb {
  if (contrastRatio(color, surface) >= minRatio) return color;
  // Try both directions and keep whichever gets there first.
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, toward, step / 20);
    if (contrastRatio(candidate, surface) >= minRatio) return candidate;
  }
  return toward;
}

/** True when a string is a hex colour we can use for a theme. */
export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && parseHex(value) !== null;

/** "9" → "9", 12.4 → "12" — compact contrast labels like "12:1". */
export const formatContrast = (ratio: number) => `${Math.round(ratio * 10) / 10}:1`;
