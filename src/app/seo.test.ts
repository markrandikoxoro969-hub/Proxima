import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("search engines + install files", () => {
  it("robots.txt keeps private pages and the API out of search results", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0]! : rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/app", "/settings", "/login", "/api/"]));
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("the sitemap lists only public pages", () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(urls).toEqual(["/", "/privacy", "/terms"]);
  });

  it("the app manifest makes PROXIMA installable", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/app");
    expect(m.icons?.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    expect(m.icons?.some((i) => i.sizes === "192x192")).toBe(true);
  });
});
