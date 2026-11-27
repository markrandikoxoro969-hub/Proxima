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

/** Official Google Sans (500–700) used for bold chat messages, replies & composer. */
export const googleSans = localFont({
  src: [
    { path: "./fonts/GoogleSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/GoogleSans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/GoogleSans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-google-sans",
  display: "swap",
  preload: false,
  fallback: ["Google Sans", "Google Sans Text", "sans-serif"],
});

/** Official Google Sans Code variable monospace for bold code blocks & inline code. */
export const googleSansCode = localFont({
  src: "./fonts/GoogleSansCode-Variable.woff2",
  variable: "--font-google-sans-code",
  weight: "300 800",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});
