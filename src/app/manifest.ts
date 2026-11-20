import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { THEME_COLORS } from "@/lib/theme";

/**
 * /manifest.webmanifest: lets phones install PROXIMA like an app
 * ("Add to Home Screen" / "Install app"), with its own icon and no browser bars.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${site.name}: ${site.tagline}`,
    short_name: site.shortName,
    description: site.description,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    categories: ["productivity", "education", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "New chat",
        short_name: "New chat",
        url: "/app",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
