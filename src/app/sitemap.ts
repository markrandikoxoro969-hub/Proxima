import type { MetadataRoute } from "next";
import { LEGAL_UPDATED } from "@/lib/legal";
import { site } from "@/lib/site";

/**
 * /sitemap.xml: the list of public pages for Google and other search engines.
 * Private pages (/app, /settings, /login) are left out on purpose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: "weekly", priority: 1 },
    {
      url: `${site.url}/privacy`,
      lastModified: LEGAL_UPDATED.privacy,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    { url: `${site.url}/terms`, lastModified: LEGAL_UPDATED.terms, changeFrequency: "yearly", priority: 0.3 },
  ];
}
