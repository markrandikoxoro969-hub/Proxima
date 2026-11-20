import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set (without a trailing slash)", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://proxima.com/" })).toBe("https://proxima.com");
  });

  it("falls back to Vercel's address, then localhost", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "proxima.vercel.app" })).toBe(
      "https://proxima.vercel.app",
    );
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "" })).toBe("http://localhost:3000");
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });

  it("ignores a localhost value accidentally copied to Vercel", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        VERCEL_PROJECT_PRODUCTION_URL: "proxima.vercel.app",
      }),
    ).toBe("https://proxima.vercel.app");
  });
});
