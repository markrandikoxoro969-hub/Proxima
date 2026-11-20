// @vitest-environment node
/**
 * Route-level checks for the natural-voice endpoint. The voice providers are
 * faked here; their own requests are unit-tested in src/lib/speech.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechProviderError, type SpeechProvider } from "@/lib/speech/types";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  provider: null as SpeechProvider | null,
  synthesize: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getApiUserId: async () => state.userId,
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: {
    speechUser: { limit: 90, windowMs: 60_000 },
    speechGuest: { limit: 20, windowMs: 60_000 },
  },
  enforceRateLimit: async () => ({
    allowed: true,
    limit: 90,
    remaining: 89,
    resetAt: new Date(Date.now() + 60_000),
    retryAfterSeconds: 60,
  }),
  rateLimitHeaders: () => ({ "X-RateLimit-Limit": "90", "X-RateLimit-Remaining": "89" }),
}));

vi.mock("@/lib/speech", () => ({
  getSpeechProvider: () => state.provider,
}));

const { POST } = await import("./route");

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/speech", {
    method: "POST",
    headers: {
      origin,
      "x-forwarded-host": "localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const call = (r: Request) => POST(r, undefined as never);

const goodAudio = () => ({
  bytes: new Uint8Array([1, 2, 3]),
  mime: "audio/mpeg",
  provider: "edge",
  voiceId: "en-US-AvaNeural",
});

beforeEach(() => {
  state.userId = null;
  state.synthesize.mockReset();
  state.synthesize.mockResolvedValue(goodAudio());
  state.provider = { id: "edge", label: "Edge", synthesize: state.synthesize };
});

describe("POST /api/speech", () => {
  it("returns audio bytes with no-store caching", async () => {
    const response = await call(request({ text: "  Hello there.  ", voice: "girl", speed: 1 }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-speech-provider")).toBe("edge");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(state.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello there.", voice: "girl", speed: 1 }),
    );
  });

  it("turns a provider failure into a friendly 503", async () => {
    state.synthesize.mockRejectedValue(new SpeechProviderError("down", "unavailable"));
    const response = await call(request({ text: "Hello", voice: "boy" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "speech_unavailable" },
    });
  });

  it("returns 504 when the voice service takes too long", async () => {
    state.synthesize.mockRejectedValue(new SpeechProviderError("slow", "timeout"));
    const response = await call(request({ text: "Hello", voice: "girl" }));
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "speech_timeout" } });
  });

  it("returns 503 when natural voice is switched off", async () => {
    state.provider = null;
    const response = await call(request({ text: "Hello", voice: "girl" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "speech_unavailable" },
    });
  });

  it("refuses another website", async () => {
    const response = await call(request({ text: "Hello", voice: "girl" }, "https://evil.test"));
    expect(response.status).toBe(403);
    expect(state.synthesize).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized piece before calling a vendor", async () => {
    const empty = await call(request({ text: "   ", voice: "girl" }));
    expect(empty.status).toBe(400);

    const long = await call(request({ text: "x".repeat(1201), voice: "girl" }));
    expect(long.status).toBe(400);
    expect(state.synthesize).not.toHaveBeenCalled();
  });
});
