import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { user: { count: () => count() } } }));

const { pictureReaderStatus, runSetupCheck } = await import("./setup-check");

const GOOD = {
  AUTH_SECRET: "x".repeat(44),
  AUTH_GOOGLE_ID: "123-abc.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "GOCSPX-test",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db",
};

/** Fake network: Google answers with `error`, the AI answers with `ai` (a reply or a status code). */
function googleReplies(error: string, ai: string | number = "ok") {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("oauth2.googleapis.com")) return Response.json({ error }, { status: 400 });
    return typeof ai === "number" ? new Response("down", { status: ai }) : Response.json({ reply: ai });
  });
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
    const googleCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("googleapis"))!;
    const body = new URLSearchParams(String(googleCall[1]!.body));
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

  it("tests the AI with a real message, even when AI_PROVIDER holds the web address", async () => {
    vi.stubEnv("AI_PROVIDER", "https://sujancoreapi.onrender.com/chat");
    const fetchSpy = googleReplies("invalid_grant", "ok");
    const ai = byName((await runSetupCheck("https://a.b")).checks, "AI engine");
    expect(ai.ok).toBe(true);
    expect(ai.detail).toMatch(/Replied in .* Tip: AI_PROVIDER contains a web address/);
    const aiCall = fetchSpy.mock.calls.find(
      ([url]) => String(url) === "https://sujancoreapi.onrender.com/chat",
    );
    expect(aiCall).toBeDefined();
  });

  it("explains a broken AI server and the fake mock AI", async () => {
    googleReplies("invalid_grant", 500);
    const down = byName((await runSetupCheck("https://a.b")).checks, "AI engine");
    expect(down.ok).toBe(false);
    expect(down.detail).toContain("HTTP 500");

    vi.stubEnv("AI_PROVIDER", "mock");
    const mock = byName((await runSetupCheck("https://a.b")).checks, "AI engine");
    expect(mock.ok).toBe(false);
    expect(mock.detail).toContain("FAKE");
  });
});

describe("pictureReaderStatus", () => {
  it("shows both NVIDIA models in the setup report", () => {
    const check = pictureReaderStatus({
      AI_PROVIDER: "nvidia",
      NVIDIA_API_KEY: "nvapi-test",
    });
    expect(check.ok).toBe(true);
    expect(check.detail).toContain("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    expect(check.detail).toContain("nvidia/nemotron-3-ultra-550b-a55b");
    expect(check.detail).toContain("thinking off");
    expect(check.detail).toContain("NVIDIA_API_KEY");
  });

  it("says when the reader has its own key", () => {
    const check = pictureReaderStatus({
      AI_PROVIDER: "nvidia",
      NVIDIA_API_KEY: "nvapi-normal",
      NVIDIA_VISION_API_KEY: "nvapi-vision",
    });
    expect(check.detail).toContain("separate vision key");
  });

  it("explains when the reader is off, unused, or has no key", () => {
    expect(
      pictureReaderStatus({
        AI_PROVIDER: "nvidia",
        NVIDIA_API_KEY: "nvapi-test",
        NVIDIA_VISION_MODEL: "off",
      }).detail,
    ).toContain("Off");
    expect(pictureReaderStatus({ AI_PROVIDER: "render" }).detail).toContain("Not used");
    expect(pictureReaderStatus({ AI_PROVIDER: "nvidia" }).detail).toContain("NVIDIA_API_KEY");
  });
});
