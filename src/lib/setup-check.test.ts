import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { user: { count: () => count() } } }));

const { runSetupCheck } = await import("./setup-check");

const GOOD = {
  AUTH_SECRET: "x".repeat(44),
  AUTH_GOOGLE_ID: "123-abc.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "GOCSPX-test",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db",
};

function googleReplies(error: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error }, { status: 400 }));
}
const byName = (checks: { name: string; ok: boolean; detail: string }[], name: string) =>
  checks.find((check) => check.name === name)!;

describe("runSetupCheck", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(GOOD)) vi.stubEnv(key, value);
    count.mockResolvedValue(1);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("passes when Google accepts the keys and the database works", async () => {
    const fetchSpy = googleReplies("invalid_grant");
    const result = await runSetupCheck("https://proxima.vercel.app");
    expect(result.ok).toBe(true);
    const body = new URLSearchParams(String(fetchSpy.mock.calls[0]![1]!.body));
    expect(body.get("redirect_uri")).toBe("https://proxima.vercel.app/api/auth/callback/google");
    expect(byName(result.checks, "Google redirect URI to add").detail).toContain(
      "https://proxima.vercel.app/api/auth/callback/google",
    );
  });

  it("explains a wrong Google secret without revealing it", async () => {
    googleReplies("invalid_client");
    const result = await runSetupCheck("https://proxima.vercel.app");
    expect(result.ok).toBe(false);
    const google = byName(result.checks, "Google accepts the ID + secret");
    expect(google.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("GOCSPX-test");
    expect(JSON.stringify(result)).not.toContain("u:p@");
  });

  it("reports missing tables and connection failures differently", async () => {
    googleReplies("invalid_grant");
    count.mockRejectedValueOnce(Object.assign(new Error("no table"), { code: "P2021" }));
    expect(byName((await runSetupCheck("https://a.b")).checks, "Database").detail).toContain("db:deploy");
    count.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    expect(byName((await runSetupCheck("https://a.b")).checks, "Database").detail).toContain("POOLED");
  });

  it("flags missing keys", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    const result = await runSetupCheck("https://a.b");
    expect(byName(result.checks, "AUTH_SECRET").ok).toBe(false);
    expect(byName(result.checks, "AUTH_GOOGLE_SECRET").ok).toBe(false);
    expect(result.checks.some((check) => check.name === "Google accepts the ID + secret")).toBe(false);
  });
});
