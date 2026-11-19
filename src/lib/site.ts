/**
 * Public site information. Safe for the browser (no secrets here!).
 * Secrets live only in environment variables read on the server.
 */
export const site = {
  name: "PROXIMA",
  shortName: "Proxima",
  tagline: "Premium Core AI",
  description:
    "PROXIMA is a premium AI assistant for coding, learning, writing and brainstorming — with voice input, file help and a beautiful glass interface.",
  version: "V2.81 CORE",
  developer: "Sujan Shrestha",
  /** Full public URL, e.g. https://proxima.vercel.app (set in .env). */
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, ""),
  links: {
    facebook: "https://m.facebook.com/profile.php?id=61583876866265",
  },
} as const;
