// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canSignImageLinks,
  isPubliclyReachable,
  publicOrigin,
  signImageId,
  signedImageUrl,
  verifyImageLink,
} from "./public-url";

const ID = "cm00000000000000000000001";

let originalAuth: string | undefined;
let originalSite: string | undefined;

beforeEach(() => {
  originalAuth = process.env.AUTH_SECRET;
  originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.AUTH_SECRET = "test-secret-for-signing";
  delete process.env.IMAGE_SIGNING_SECRET;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  if (originalAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuth;
  if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
  delete process.env.IMAGE_SIGNING_SECRET;
});

describe("signed image links", () => {
  it("accepts its own signature and rejects anything else", () => {
    const expires = Date.now() + 60_000;
    const signature = signImageId(ID, expires)!;
    expect(signature).toBeTruthy();
    expect(verifyImageLink(ID, expires, signature)).toBe(true);

    // Tampered id, expiry, signature, and an expired link all fail.
    expect(verifyImageLink(`${ID}9`, expires, signature)).toBe(false);
    expect(verifyImageLink(ID, expires + 1000, signature)).toBe(false);
    expect(verifyImageLink(ID, expires, `${signature.slice(0, -2)}xx`)).toBe(false);
    expect(verifyImageLink(ID, expires, "")).toBe(false);
    expect(verifyImageLink(ID, Date.now() - 1, signature)).toBe(false);
  });

  it("refuses to sign without a secret", () => {
    delete process.env.AUTH_SECRET;
    expect(canSignImageLinks()).toBe(false);
    expect(signImageId(ID, Date.now() + 1000)).toBeNull();
    expect(verifyImageLink(ID, Date.now() + 1000, "anything")).toBe(false);
  });

  it("uses IMAGE_SIGNING_SECRET when it is set", () => {
    process.env.IMAGE_SIGNING_SECRET = "dedicated-secret";
    const expires = Date.now() + 60_000;
    const dedicated = signImageId(ID, expires)!;
    process.env.IMAGE_SIGNING_SECRET = "different-secret";
    expect(verifyImageLink(ID, expires, dedicated)).toBe(false);
  });
});

describe("the address engines can reach", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://internal/api/images/x/edit", { method: "POST", headers });

  it("prefers the configured site address", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://proxima.example/";
    expect(publicOrigin(request({ host: "internal:3000" }))).toBe("https://proxima.example");
  });

  it("falls back to the forwarded host of the request", () => {
    expect(
      publicOrigin(request({ "x-forwarded-host": "proxima.example", "x-forwarded-proto": "https" })),
    ).toBe("https://proxima.example");
    expect(publicOrigin(request({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(publicOrigin(undefined)).toBe("");
  });

  it("builds a signed, expiring link for a reachable address", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://proxima.example";
    const url = new URL(signedImageUrl(ID, undefined)!);
    expect(url.origin).toBe("https://proxima.example");
    expect(url.pathname).toBe(`/api/images/${ID}/source`);
    const expires = Number(url.searchParams.get("exp"));
    expect(expires).toBeGreaterThan(Date.now());
    expect(verifyImageLink(ID, expires, url.searchParams.get("sig")!)).toBe(true);
  });

  it("gives nothing for localhost, private networks or a missing secret", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(signedImageUrl(ID, undefined)).toBeUndefined();
    process.env.NEXT_PUBLIC_SITE_URL = "http://192.168.1.20:3000";
    expect(signedImageUrl(ID, undefined)).toBeUndefined();
    process.env.NEXT_PUBLIC_SITE_URL = "https://proxima.example";
    delete process.env.AUTH_SECRET;
    expect(signedImageUrl(ID, undefined)).toBeUndefined();
  });

  it("knows which addresses the internet can reach", () => {
    expect(isPubliclyReachable("https://proxima.example")).toBe(true);
    expect(isPubliclyReachable("http://localhost:3000")).toBe(false);
    expect(isPubliclyReachable("http://10.0.0.4")).toBe(false);
    expect(isPubliclyReachable("http://172.20.0.1")).toBe(false);
    expect(isPubliclyReachable("http://printer.local")).toBe(false);
    expect(isPubliclyReachable("nonsense")).toBe(false);
  });
});
