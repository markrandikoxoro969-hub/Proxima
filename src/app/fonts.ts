import localFont from "next/font/local";

/**
 * Self-hosted variable fonts (files live in ./fonts, licensed under OFL).
 * No request to Google at runtime or build time. One file per family covers
 * every weight (100–900), and next/font adds size-adjusted fallbacks so the
 * text doesn't jump when the font loads (protects CLS).
 */
export const montserrat = localFont({
  src: "./fonts/Montserrat-Variable.woff2",
  variable: "--font-montserrat",
  weight: "100 900",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

export const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
  // Mono is only used for small labels/code — don't compete with the hero font.
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});
