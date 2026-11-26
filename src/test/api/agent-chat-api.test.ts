// @vitest-environment node
/**
 * Integration tests for Phase 10: Universal Autonomous Agent persistence &
 * resumable checkpoints inside POST /api/chat (real PGlite Postgres + fake AI).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "@/lib/ai/types";
import { createTestDb, type TestDb } from "@/test/test-db";
import { readSse, replyText, req } from "./helpers";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  responses: [] as (string | Error)[],
}));

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(state.db as object, prop) }),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (state.userId ? { user: { id: state.userId } } : null)),
}));
vi.mock("@/lib/ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...real,
    getAiProvider: () => ({
      id: "fake-agent",
      label: "Fake Agent AI",
      async *stream() {
        const next = state.responses.shift();
        if (next instanceof Error) throw next;
        yield { type: "text" as const, text: next ?? "" };
      },
    }),
  };
});

import { POST as postChat } from "@/app/api/chat/route";

let tdb: TestDb;
let userId: string;

const callChat = (body: Record<string, unknown>) =>
  postChat(req("/api/chat", { method: "POST", body }), { params: Promise.resolve({}) });

beforeAll(async () => {
  tdb = await createTestDb();
  state.db = tdb.prisma;
  const user = await tdb.prisma.user.create({
    data: { email: "agent-test@example.com", name: "Agent Tester", onboardedAt: new Date() },
  });
  userId = user.id;
});

beforeEach(async () => {
  state.userId = userId;
  state.responses = [];
  await tdb.prisma.conversation.deleteMany({ where: { userId } });
  await tdb.prisma.rateLimit.deleteMany();
});

afterAll(async () => {
  await tdb.close();
});

describe("POST /api/chat — Persistent Autonomous Agent Checkpoints", () => {
  it("executes a multi-step /agent task across durable checkpoints and verifies completion", async () => {
    state.responses = [
      // Invocation 1: plan + step 1 tool action
      '{"steps":["Compute 14 * 6","Validate JSON output"]}',
      '{"tool":"calculate","args":{"expression":"14 * 6"}}',
      // Invocation 2 (agentContinue): step 2 tool action + final verified summary
      '{"tool":"validate_json","args":{"input":"{\\"result\\":84}"}}',
      "Verified: 14 * 6 = 84 and the JSON payload is valid.",
    ];

    // Turn 1: plans & executes step 1, persists checkpoint, hands off via agent-continue
    const res1 = await callChat({ message: "/agent Compute 14 * 6 and validate JSON" });
    expect(res1.status).toBe(200);
    const events1 = await readSse(res1);
    const cont = events1.find((e) => e.event === "agent-continue");
    expect(cont).toBeDefined();
    const contData = cont?.data as {
      conversationId: string;
      completedSteps: number;
      totalSteps: number;
      retry: boolean;
    };
    expect(contData.completedSteps).toBe(1);
    expect(contData.totalSteps).toBe(2);
    expect(contData.retry).toBe(false);
    expect(replyText(events1)).toContain("84");

    // Verify durable checkpoint is saved in Postgres before turn 2
    const savedMid = await tdb.prisma.message.findFirst({
      where: { conversationId: contData.conversationId, role: "assistant" },
    });
    expect(savedMid?.generationProgress).toMatchObject({
      kind: "universal-agent",
      currentStepIndex: 1,
    });

    // Turn 2: resumes from persisted checkpoint, finishes step 2, verifies, clears generationProgress
    const res2 = await callChat({
      message: "/agent Compute 14 * 6 and validate JSON",
      conversationId: contData.conversationId,
      retry: true,
      agentContinue: true,
    });
    expect(res2.status).toBe(200);
    const events2 = await readSse(res2);
    const done = events2.find((e) => e.event === "done");
    expect(done).toBeDefined();
    expect((done?.data as { text: string }).text).toContain("Verified: 14 * 6 = 84");

    const savedFinal = await tdb.prisma.message.findFirst({
      where: { conversationId: contData.conversationId, role: "assistant" },
    });
    expect(savedFinal?.generationProgress).toBeNull();
    expect(savedFinal?.content).toContain("84");
  });

  it("recovers cleanly when step 2 times out without losing completed step 1", async () => {
    state.responses = [
      // Turn 1: plan + step 1 succeeds
      '{"steps":["Compute 9 + 11","Check UTC timestamp"]}',
      '{"tool":"calculate","args":{"expression":"9 + 11"}}',
      // Turn 2: provider times out while selecting step 2
      new AiProviderError("Upstream timed out", "timeout"),
      // Turn 3 (automatic retry from checkpoint): step 2 succeeds + summary
      '{"tool":"current_time","args":{}}',
      "Completed both steps: sum is 20 and timestamp recorded.",
    ];

    const res1 = await callChat({ message: "/agent Add 9 and 11 then check time" });
    const events1 = await readSse(res1);
    const convId = (events1.find((e) => e.event === "agent-continue")?.data as { conversationId: string })
      .conversationId;

    // Turn 2 times out → emits agent-continue { retry: true } with completedSteps still 1
    const res2 = await callChat({
      message: "/agent Add 9 and 11 then check time",
      conversationId: convId,
      retry: true,
      agentContinue: true,
    });
    const events2 = await readSse(res2);
    const retryEvent = events2.find((e) => e.event === "agent-continue");
    expect(retryEvent?.data).toMatchObject({ conversationId: convId, completedSteps: 1, retry: true });

    // Turn 3 resumes from step 2 and completes cleanly
    const res3 = await callChat({
      message: "/agent Add 9 and 11 then check time",
      conversationId: convId,
      retry: true,
      agentContinue: true,
    });
    const events3 = await readSse(res3);
    const done = events3.find((e) => e.event === "done");
    expect(done).toBeDefined();
    expect((done?.data as { text: string }).text).toContain("sum is 20");
  });

  it("rejects stale or forged agentContinue requests with 409 stale_checkpoint", async () => {
    const conv = await tdb.prisma.conversation.create({
      data: {
        userId,
        title: "Normal chat",
        messages: { create: { role: "user", content: "/agent test" } },
      },
    });
    const res = await callChat({
      message: "/agent test",
      conversationId: conv.id,
      retry: true,
      agentContinue: true,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("stale_checkpoint");
  });

  it("activates multi-step agent mode via agentMode: true using expanded sandboxed tools", async () => {
    state.responses = [
      '{"steps":["Convert 10 km to miles"]}',
      '{"tool":"convert_units","args":{"value":10,"from":"km","to":"mi"}}',
      "10 km equals approximately 6.213712 miles.",
    ];

    const res = await callChat({ message: "Convert 10 km to miles", agentMode: true });
    expect(res.status).toBe(200);
    const events = await readSse(res);
    const done = events.find((e) => e.event === "done");
    expect(done).toBeDefined();
    expect((done?.data as { text: string }).text).toContain("6.213712");
  });
});
