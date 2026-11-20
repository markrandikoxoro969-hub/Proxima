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
  /** Full public URL, e.g. https://proxima.vercel.app (see resolveSiteUrl below). */
  url: resolveSiteUrl(),
  links: {
    facebook: "https://m.facebook.com/profile.php?id=61583876866265",
  },
} as const;

/**
 * The site's public address, used for share previews, the sitemap and canonical links.
 *  1. NEXT_PUBLIC_SITE_URL if you set it (e.g. your own domain),
 *  2. otherwise the address Vercel gives the project automatically,
 *  3. otherwise http://localhost:3000 (your computer).
 * A "localhost" value accidentally copied to Vercel is ignored there.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const isLocal = (url: string) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
  const url =
    fromEnv && !(vercel && isLocal(fromEnv))
      ? fromEnv
      : vercel
        ? `https://${vercel}`
        : "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
