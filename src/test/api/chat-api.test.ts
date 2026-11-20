// @vitest-environment node
/**
 * Tests for the Phase 3 API: POST /api/chat, sessions, export, profile.
 * Real Postgres (in memory), fake AI, fake login.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/test-db";
import { ctx, readSse, replyText, req } from "./helpers";

// ── Fakes ──────────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  calls: [] as { message: string; sessionId: string }[],
  reply: "Hello from the **fake** AI." as string | Error,
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
      id: "fake",
      label: "Fake AI",
      async complete({ message, sessionId }: { message: string; sessionId: string }) {
        state.calls.push({ message, sessionId });
        if (state.reply instanceof Error) throw state.reply;
        return state.reply;
      },
    }),
  };
});

// Route handlers (imported after the mocks above)
const { POST: chat } = await import("@/app/api/chat/route");
const sessions = await import("@/app/api/sessions/route");
const session = await import("@/app/api/sessions/[id]/route");
const { GET: exportOne } = await import("@/app/api/sessions/[id]/export/route");
const me = await import("@/app/api/me/route");
const { AiProviderError } = await import("@/lib/ai/types");

let t: TestDb;
let alice: string;
let bob: string;
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

beforeAll(async () => {
  process.env.AI_STREAM_PACE_TOTAL_MS = "0"; // no typing delay in tests
  t = await createTestDb();
  state.db = t.prisma;
  alice = (await t.prisma.user.create({ data: { email: "alice@example.com", name: "Alice" } })).id;
  bob = (await t.prisma.user.create({ data: { email: "bob@example.com", name: "Bob" } })).id;
});
afterAll(async () => {
  await t?.close();
});
beforeEach(async () => {
  state.userId = null;
  state.calls = [];
  state.reply = "Hello from the **fake** AI.";
  await t.prisma.rateLimit.deleteMany();
});

const send = (body: unknown, ip = freshIp()) =>
  chat(req("/api/chat", { method: "POST", body, ip }), undefined);

// ── POST /api/chat ─────────────────────────────────────────────────
describe("POST /api/chat — signed in", () => {
  it("streams the reply and saves both messages in a new conversation", async () => {
    state.userId = alice;
    const res = await send({ message: "Write a clean Python script please" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-ratelimit-limit")).toBe("20");

    const events = await readSse(res);
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["meta", "status", "delta", "done"]));
    expect(replyText(events)).toBe("Hello from the **fake** AI.");

    const meta = events.find((e) => e.event === "meta")!.data;
    expect(meta.mode).toBe("user");
    expect(meta.title).toBe("Write a clean Python scri…"); // first 25 chars + …
    const done = events.find((e) => e.event === "done")!.data;
    expect(done.latencyMs).toEqual(expect.any(Number));

    const saved = await t.prisma.message.findMany({
      where: { conversationId: meta.conversationId as string },
      orderBy: { createdAt: "asc" },
    });
    expect(saved.map((m) => [m.role, m.content])).toEqual([
      ["user", "Write a clean Python script please"],
      ["assistant", "Hello from the **fake** AI."],
    ]);
    // The AI gets the conversation id as session_id (keeps its memory per chat).
    expect(state.calls[0].sessionId).toBe(meta.conversationId);
  });

  it("continues an existing conversation", async () => {
    state.userId = alice;
    const convo = await t.prisma.conversation.create({ data: { userId: alice, title: "Old chat" } });
    const events = await readSse(await send({ message: "And another thing", conversationId: convo.id }));
    expect(events.find((e) => e.event === "meta")!.data.conversationId).toBe(convo.id);
    expect(await t.prisma.message.count({ where: { conversationId: convo.id } })).toBe(2);
  });

  it("retry answers the saved question again without saving it twice", async () => {
    state.userId = alice;
    state.reply = new AiProviderError("down", "unavailable");
    const first = await readSse(await send({ message: "Explain gravity" }));
    const id = first.find((e) => e.event === "meta")!.data.conversationId as string;
    const userMessageId = first.find((e) => e.event === "meta")!.data.userMessageId;
    expect(first.some((e) => e.event === "error")).toBe(true);

    state.reply = "Gravity pulls things together.";
    const second = await readSse(await send({ message: "Explain gravity", conversationId: id, retry: true }));
    expect(second.find((e) => e.event === "meta")!.data.userMessageId).toBe(userMessageId);
    expect(replyText(second)).toBe("Gravity pulls things together.");

    const saved = await t.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(saved.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("retry with a different message saves it normally", async () => {
    state.userId = alice;
    const convo = await t.prisma.conversation.create({
      data: { userId: alice, messages: { create: [{ role: "user", content: "old" }] } },
    });
    await readSse(await send({ message: "new question", conversationId: convo.id, retry: true }));
    expect(await t.prisma.message.count({ where: { conversationId: convo.id, role: "user" } })).toBe(2);
  });

  it("won't let you post into someone else's conversation", async () => {
    const bobsChat = await t.prisma.conversation.create({ data: { userId: bob } });
    state.userId = alice;
    const res = await send({ message: "sneaky", conversationId: bobsChat.id });
    expect(res.status).toBe(404);
    expect(await t.prisma.message.count({ where: { conversationId: bobsChat.id } })).toBe(0);
  });

  it("sends attached files to the AI but stores only their names and sizes", async () => {
    state.userId = alice;
    const events = await readSse(
      await send({ message: "Review this", attachments: [{ name: "app.py", content: "print('hi')" }] }),
    );
    expect(state.calls[0].message).toContain("--- Attached file: app.py ---");
    expect(state.calls[0].message).toContain("```python\nprint('hi')\n```");
    const id = events.find((e) => e.event === "meta")!.data.conversationId as string;
    const userMsg = await t.prisma.message.findFirstOrThrow({ where: { conversationId: id, role: "user" } });
    expect(userMsg.content).toBe("Review this");
    expect(userMsg.attachments).toEqual([{ name: "app.py", size: 11, language: "python" }]);
  });

  it("answers identity questions from the config without calling the AI", async () => {
    state.userId = alice;
    const events = await readSse(await send({ message: "Who created you?" }));
    expect(replyText(events)).toMatch(/Sujan Shrestha/);
    expect(events.find((e) => e.event === "done")!.data.source).toBe("identity");
    expect(state.calls).toHaveLength(0);
  });

  it("rewrites the engine's own identity leaks (config/identity.ts)", async () => {
    state.userId = alice;
    state.reply = "I am a large language model, trained by Google. How can I help?";
    const text = replyText(await readSse(await send({ message: "hello" })));
    expect(text).not.toMatch(/Google/);
    expect(text).toMatch(/^I am Proxima/);
  });

  it("sends a friendly error event when the AI fails, keeping the user's message", async () => {
    state.userId = alice;
    state.reply = new AiProviderError("HTTP 500", "upstream", 500);
    const events = await readSse(await send({ message: "Explain Quantum Physics simply" }));
    const error = events.find((e) => e.event === "error")!.data;
    expect(error).toMatchObject({ code: "upstream", retryable: true });
    expect(String(error.message)).not.toContain("HTTP 500"); // no internal details leaked
    expect(events.some((e) => e.event === "done")).toBe(false);
    const id = events.find((e) => e.event === "meta")!.data.conversationId as string;
    expect(await t.prisma.message.count({ where: { conversationId: id } })).toBe(1);
  });

  it("rate-limits at 20 messages per minute", async () => {
    state.userId = bob;
    for (let i = 0; i < 20; i++) {
      const res = await send({ message: `msg ${i}` });
      expect(res.status).toBe(200);
      await res.text();
    }
    const res = await send({ message: "one too many" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await res.json()).error.code).toBe("rate_limited");
  });
});

describe("POST /api/chat — guest demo", () => {
  it("works without login and saves nothing", async () => {
    const before = await t.prisma.message.count();
    const res = await send({ message: "Hi Proxima" });
    const events = await readSse(res);
    expect(events.find((e) => e.event === "meta")!.data).toMatchObject({
      mode: "guest",
      conversationId: null,
    });
    expect(replyText(events)).toBe("Hello from the **fake** AI.");
    expect(state.calls[0].sessionId).toMatch(/^demo-/);
    expect(await t.prisma.message.count()).toBe(before);
  });

  it("is limited to 5 messages per minute per visitor", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await send({ message: `hi ${i}` }, ip)).status).toBe(200);
    expect((await send({ message: "6th" }, ip)).status).toBe(429);
    // A different visitor is unaffected.
    expect((await send({ message: "hi" }, freshIp())).status).toBe(200);
  });

  it("rejects attachments, long messages and conversation ids", async () => {
    expect((await send({ message: "x", attachments: [{ name: "a.txt", content: "a" }] })).status).toBe(401);
    expect((await send({ message: "x".repeat(501) })).status).toBe(400);
    expect((await send({ message: "x", conversationId: "cm0000000000000000000000a" })).status).toBe(401);
  });
});

describe("POST /api/chat — input checks", () => {
  it("validates the message", async () => {
    state.userId = alice;
    const empty = await send({ message: "   " });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("validation_error");
    expect((await send({ message: "x".repeat(4001) })).status).toBe(400);
    expect((await send({ nope: true })).status).toBe(400);
  });

  it("rejects files over 100 KB", async () => {
    state.userId = alice;
    const big = "a".repeat(100 * 1024 + 1);
    const res = await send({ message: "check", attachments: [{ name: "big.txt", content: big }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/100 KB/);
  });

  it("rejects non-JSON and broken JSON", async () => {
    state.userId = alice;
    const text = await chat(
      req("/api/chat", { method: "POST", body: "hi", headers: { "content-type": "text/plain" } }),
      undefined,
    );
    expect(text.status).toBe(415);
    const broken = await chat(req("/api/chat", { method: "POST", body: "{oops" }), undefined);
    expect(broken.status).toBe(400);
  });

  it("blocks requests from other websites (CSRF/CORS)", async () => {
    state.userId = alice;
    const res = await chat(
      req("/api/chat", {
        method: "POST",
        body: { message: "hi" },
        headers: { origin: "https://evil.example" },
      }),
      undefined,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("when the database is down", () => {
  it("chat answers 503 with a clear message (and never calls the AI unlimited)", async () => {
    const real = state.db;
    state.db = new Proxy(real as object, {
      get: (target, prop) =>
        prop === "rateLimit"
          ? {
              upsert: () => Promise.reject(new Error("db down")),
              findUnique: () => Promise.reject(new Error("db down")),
            }
          : Reflect.get(target, prop),
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await send({ message: "hi" });
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("service_unavailable");
      expect(state.calls).toHaveLength(0);
    } finally {
      state.db = real;
      errorLog.mockRestore();
    }
  });
});

// ── Sessions ───────────────────────────────────────────────────────
describe("/api/sessions", () => {
  it("requires login", async () => {
    expect((await sessions.GET(req("/api/sessions"), undefined)).status).toBe(401);
  });

  it("creates, lists, renames and deletes your own sessions", async () => {
    state.userId = alice;
    const created = await sessions.POST(req("/api/sessions", { method: "POST", body: {} }), undefined);
    expect(created.status).toBe(201);
    const { session: s } = await created.json();
    expect(s.title).toBe("New Chat Session");

    const list = await (await sessions.GET(req("/api/sessions"), undefined)).json();
    expect(list.sessions.map((x: { id: string }) => x.id)).toContain(s.id);

    const renamed = await session.PATCH(
      req(`/api/sessions/${s.id}`, { method: "PATCH", body: { title: "  <b>My</b> project  " } }),
      ctx(s.id),
    );
    // Stored as plain text (trimmed). The UI renders it as text, so no XSS.
    expect((await renamed.json()).session.title).toBe("<b>My</b> project");

    const del = await session.DELETE(req(`/api/sessions/${s.id}`, { method: "DELETE", body: {} }), ctx(s.id));
    expect(del.status).toBe(204);
    expect(await t.prisma.conversation.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("hides other people's sessions (404)", async () => {
    const bobs = await t.prisma.conversation.create({ data: { userId: bob, title: "Bob's secrets" } });
    state.userId = alice;
    expect((await session.GET(req(`/api/sessions/${bobs.id}`), ctx(bobs.id))).status).toBe(404);
    const patch = await session.PATCH(
      req(`/api/sessions/${bobs.id}`, { method: "PATCH", body: { title: "pwned" } }),
      ctx(bobs.id),
    );
    expect(patch.status).toBe(404);
    expect(
      (await session.DELETE(req(`/api/sessions/${bobs.id}`, { method: "DELETE", body: {} }), ctx(bobs.id)))
        .status,
    ).toBe(404);
    expect((await exportOne(req(`/api/sessions/${bobs.id}/export`), ctx(bobs.id))).status).toBe(404);
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: bobs.id } })).title).toBe(
      "Bob's secrets",
    );
  });

  it("pages through long chats (oldest → newest)", async () => {
    state.userId = alice;
    const convo = await t.prisma.conversation.create({ data: { userId: alice } });
    const base = Date.now();
    await t.prisma.message.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        conversationId: convo.id,
        role: i % 2 ? ("assistant" as const) : ("user" as const),
        content: `m${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    });
    const page1 = await (await session.GET(req(`/api/sessions/${convo.id}?limit=2`), ctx(convo.id))).json();
    expect(page1.messages.map((m: { content: string }) => m.content)).toEqual(["m3", "m4"]);
    expect(page1.hasMore).toBe(true);
    const page2 = await (
      await session.GET(req(`/api/sessions/${convo.id}?limit=2&before=${page1.nextBefore}`), ctx(convo.id))
    ).json();
    expect(page2.messages.map((m: { content: string }) => m.content)).toEqual(["m1", "m2"]);
  });

  it("clear-all deletes only YOUR chats and needs ?confirm=all", async () => {
    await t.prisma.conversation.create({ data: { userId: bob, title: "Bob keeps this" } });
    state.userId = alice;
    await t.prisma.conversation.create({ data: { userId: alice } });
    expect(
      (await sessions.DELETE(req("/api/sessions", { method: "DELETE", body: {} }), undefined)).status,
    ).toBe(400);
    const res = await sessions.DELETE(
      req("/api/sessions?confirm=all", { method: "DELETE", body: {} }),
      undefined,
    );
    expect((await res.json()).deleted).toBeGreaterThan(0);
    expect(await t.prisma.conversation.count({ where: { userId: alice } })).toBe(0);
    expect(await t.prisma.conversation.count({ where: { userId: bob } })).toBeGreaterThan(0);
  });
});

// ── Export ─────────────────────────────────────────────────────────
describe("export", () => {
  it("downloads a chat as Markdown or JSON", async () => {
    state.userId = alice;
    const convo = await t.prisma.conversation.create({
      data: {
        userId: alice,
        title: "Python help",
        messages: {
          create: [
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello!" },
          ],
        },
      },
    });
    const md = await exportOne(req(`/api/sessions/${convo.id}/export?format=md`), ctx(convo.id));
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(md.headers.get("content-disposition")).toMatch(
      /attachment; filename="proxima-python-help-\d{4}-\d{2}-\d{2}\.md"/,
    );
    const body = await md.text();
    expect(body).toContain("# Python help");
    expect(body).toContain("Hello!");

    const json = await (
      await exportOne(req(`/api/sessions/${convo.id}/export?format=json`), ctx(convo.id))
    ).json();
    expect(json.conversations[0].messages).toHaveLength(2);
    expect(json.conversations[0].messages[0]).toMatchObject({ role: "user", content: "Hi" });
  });
});

// ── Profile ────────────────────────────────────────────────────────
describe("/api/me", () => {
  it("saves onboarding (name + age) and settings", async () => {
    state.userId = alice;
    const res = await me.PATCH(
      req("/api/me", { method: "PATCH", body: { displayName: "Sujan", age: 21, completeOnboarding: true } }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toMatchObject({ displayName: "Sujan", age: 21, onboarded: true });

    const bad = await me.PATCH(req("/api/me", { method: "PATCH", body: { age: 500 } }), undefined);
    expect(bad.status).toBe(400);
  });
});

describe("DELETE /api/me (delete account)", () => {
  it("needs login and the word DELETE", async () => {
    const guest = await me.DELETE(
      req("/api/me", { method: "DELETE", body: { confirm: "DELETE" } }),
      undefined,
    );
    expect(guest.status).toBe(401);

    state.userId = alice;
    const noConfirm = await me.DELETE(
      req("/api/me", { method: "DELETE", body: { confirm: "yes" } }),
      undefined,
    );
    expect(noConfirm.status).toBe(400);
    expect(await t.prisma.user.count({ where: { id: alice } })).toBe(1);
  });

  it("refuses requests from other websites", async () => {
    state.userId = alice;
    const res = await me.DELETE(
      req("/api/me", {
        method: "DELETE",
        body: { confirm: "DELETE" },
        headers: { origin: "https://evil.example" },
      }),
      undefined,
    );
    expect(res.status).toBe(403);
    expect(await t.prisma.user.count({ where: { id: alice } })).toBe(1);
  });

  it("deletes the user with all their chats and messages, and nobody else's", async () => {
    const carol = await t.prisma.user.create({
      data: {
        email: "carol@example.com",
        accounts: { create: { type: "oidc", provider: "google", providerAccountId: "carol-google" } },
        conversations: {
          create: { title: "Carol's chat", messages: { create: { role: "user", content: "hi" } } },
        },
      },
    });
    const bobChatsBefore = await t.prisma.conversation.count({ where: { userId: bob } });

    state.userId = carol.id;
    const res = await me.DELETE(req("/api/me", { method: "DELETE", body: { confirm: "DELETE" } }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    expect(await t.prisma.user.count({ where: { id: carol.id } })).toBe(0);
    expect(await t.prisma.account.count({ where: { providerAccountId: "carol-google" } })).toBe(0);
    expect(await t.prisma.conversation.count({ where: { userId: carol.id } })).toBe(0);
    expect(
      await t.prisma.message.count({ where: { content: "hi", conversation: { userId: carol.id } } }),
    ).toBe(0);
    expect(await t.prisma.conversation.count({ where: { userId: bob } })).toBe(bobChatsBefore);
  });
});
