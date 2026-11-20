import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/** /robots.txt: search engines may read the public pages, not the private app or the API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/settings", "/login", "/api/"] }],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
