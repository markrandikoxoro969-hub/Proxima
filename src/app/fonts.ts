import localFont from "next/font/local";

/**
 * Self-hosted premium variable fonts (files live in ./fonts, licensed under OFL).
 * Zero runtime requests to Google; one compact variable file per family covers
 * every weight cleanly with size-adjusted fallbacks to protect CLS.
 *
 * - Plus Jakarta Sans (200–800): crisp, bold luxury UI & reading sans-serif.
 * - Space Grotesk (300–700): sculptural geometric display face for headings & brand.
 * - Geist Mono (100–900): Swiss precision bold monospace for code blocks, Sandbox & Prompt.
 */
export const plusJakartaSans = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

export const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-Variable.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
});

export const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});
