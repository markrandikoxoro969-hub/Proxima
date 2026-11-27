import type { Metadata, Viewport } from "next";
import { ProximaSplash } from "@/components/brand/proxima-splash";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { PerfGuards } from "@/components/system/perf-guards";
import { ThemeBackdrop } from "@/components/theme/theme-backdrop";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { site } from "@/lib/site";
import { THEME_COLORS, THEME_STYLE_ID, themeInitScript, themeStyleSheet } from "@/lib/theme";
import { jetbrainsMono, montserrat } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: ["AI assistant", "AI chat", "code review", "debugging", "file analysis", site.name],
  authors: [{ name: site.developer, url: site.links.facebook }],
  creator: site.developer,
  // The share picture comes from src/app/opengraph-image.tsx automatically.
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
  },
  appleWebApp: { capable: true, title: site.shortName, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

/**
 * Viewport: zoom is ALLOWED (the old file blocked it with user-scalable=no,
 * which fails accessibility). `viewport-fit=cover` lets us use safe-area
 * insets on phones with notches, and `interactiveWidget` keeps the message box
 * above the on-screen keyboard.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: shrink the page when the keyboard opens instead of letting it
  // cover the composer (the chat then keeps its input visible).
  interactiveWidget: "resizes-content",
  themeColor: THEME_COLORS.dark,
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script below changes the class before React loads.
      suppressHydrationWarning
      // Lets Next.js pause smooth scrolling during page changes.
      data-scroll-behavior="smooth"
      // The saved theme (see src/lib/theme.ts) replaces these defaults before paint.
      data-theme="proxima"
      className={`dark ${montserrat.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Every built-in theme's colours, generated from one source of truth. */}
        <style id={THEME_STYLE_ID} dangerouslySetInnerHTML={{ __html: themeStyleSheet }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only rounded-xl bg-inverse px-4 py-3 font-bold text-on-inverse focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200]"
        >
          Skip to content
        </a>
        <ThemeProvider>
          {/* Original Proxima loading splash on load, refresh & tab return. */}
          <ProximaSplash />
          {/* Sky / Ocean / Nature paint a slow background behind every page. */}
          <ThemeBackdrop />
          {children}
        </ThemeProvider>
        <PerfGuards />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
