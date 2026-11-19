import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./redirect";

describe("safeCallbackUrl (blocks open redirects)", () => {
  it.each([
    ["/app", "/app"],
    ["/app?session=abc", "/app?session=abc"],
    ["/settings", "/settings"],
  ])("allows our own page %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "/app\n//evil.com",
    "/login",
    "/api/auth/signout",
    "",
    null,
    undefined,
    42,
  ])("rejects %s", (input) => {
    expect(safeCallbackUrl(input)).toBe("/app");
  });
});
