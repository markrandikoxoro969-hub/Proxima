import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { site } from "@/lib/site";
import { THEME_COLORS, themeInitScript } from "@/lib/theme";
import { jetbrainsMono, montserrat } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  appleWebApp: { capable: true, title: site.shortName, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

/**
 * Viewport: zoom is ALLOWED (the old file blocked it with user-scalable=no,
 * which fails accessibility). `viewport-fit=cover` lets us use safe-area
 * insets on phones with notches.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      className={`dark ${montserrat.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only rounded-xl bg-inverse px-4 py-3 font-bold text-on-inverse focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200]"
        >
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
