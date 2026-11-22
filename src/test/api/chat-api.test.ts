// @vitest-environment node
/**
 * Tests for the Phase 3 API: POST /api/chat, sessions, export, profile.
 * Real Postgres (in memory), fake AI, fake login.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/test-db";
import { ctx, readSse, reasoningText, replyText, req } from "./helpers";
import { readChatStream } from "@/lib/chat/client/sse";

// ── Fakes ──────────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  calls: [] as {
    message: string;
    sessionId: string;
    history?: { role: string; content: string }[];
    showReasoning?: boolean;
    system?: string;
  }[],
  reply: "Hello from the **fake** AI." as string | Error,
  stream: null as ({ type: "text" | "reasoning"; text: string } | Error)[] | null,
  responses: [] as (string | string[] | Error)[],
  fileGate: null as Promise<void> | null,
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
    getAiProvider: () => {
      const record = (request: {
        message: string;
        sessionId: string;
        history?: { role: string; content: string }[];
        showReasoning?: boolean;
        system?: string;
      }) =>
        state.calls.push({
          message: request.message,
          sessionId: request.sessionId,
          history: request.history,
          showReasoning: request.showReasoning,
          system: request.system,
        });

      const base = {
        id: "fake",
        label: "Fake AI",
        async complete(request: {
          message: string;
          sessionId: string;
          history?: { role: string; content: string }[];
          showReasoning?: boolean;
          system?: string;
        }) {
          record(request);
          if (state.reply instanceof Error) throw state.reply;
          return state.reply;
        },
      };

      // Expose stream() only when a test scripts tokens or a sequence of task responses.
      if (!state.stream && state.responses.length === 0) return base;
      return {
        ...base,
        async *stream(request: {
          message: string;
          sessionId: string;
          history?: { role: string; content: string }[];
          showReasoning?: boolean;
          system?: string;
        }) {
          record(request);
          const response = state.responses.shift();
          if (response instanceof Error) throw response;
          if (Array.isArray(response)) {
            const marker =
              request.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1] ?? "";
            for (const [index, part] of response.entries()) {
              yield { type: "text", text: part.replaceAll("{{MARKER}}", marker) };
              if (index === 0 && state.fileGate) await state.fileGate;
            }
            return;
          }
          if (typeof response === "string") {
            const marker =
              request.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1] ?? "";
            yield { type: "text", text: response.replaceAll("{{MARKER}}", marker) };
            return;
          }
          for (const delta of state.stream ?? []) {
            if (delta instanceof Error) throw delta;
            yield delta;
          }
        },
      };
    },
  };
});

// Route handlers (imported after the mocks above)
const { POST: chat } = await import("@/app/api/chat/route");
const { GET: getSkills, POST: mutateSkill } = await import("@/app/api/skills/route");
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
  state.stream = null;
  state.responses = [];
  state.fileGate = null;
  await t.prisma.rateLimit.deleteMany();
  await t.prisma.userSkill.deleteMany();
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
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["meta", "status", "token", "done"]));
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

  it("uses a structured plan even for a one-file Coding request", async () => {
    state.userId = alice;
    state.responses = [
      JSON.stringify({ files: [{ path: "app/main.py" }] }),
      "```py\nprint('hello')\n```\n{{MARKER}}",
    ];
    const events = await readSse(await send({ message: "Write a hello world script", mode: "coding" }));
    const text = replyText(events);
    expect(text).toContain("└── app/");
    expect(text).toContain("└── main.py");
    expect(text).toContain("### `app/main.py`");
    expect(events.at(-1)?.event).toBe("done");
    expect(state.calls).toHaveLength(2);
  });

  it("repairs an unfinished file without saving its unverified output", async () => {
    state.userId = alice;
    state.responses = [
      JSON.stringify({ files: [{ path: "src/a.ts" }, { path: "src/b.ts" }] }),
      "```ts\nexport const a = 1;\n```\n{{MARKER}}",
      "```ts\nconst broken = true;\n```",
      "```ts\nexport const b = 2;\n```\n{{MARKER}}",
    ];
    const events = await readSse(await send({ message: "Create src/a.ts and src/b.ts", mode: "coding" }));
    expect(events.some((event) => event.event === "done")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.event === "status" && String(event.data.message).includes("Fixing the format of src/b.ts"),
      ),
    ).toBe(true);
    expect(replyText(events)).not.toContain("broken");
    const id = events.find((event) => event.event === "meta")!.data.conversationId as string;
    const saved = await t.prisma.message.findFirstOrThrow({
      where: { conversationId: id, role: "assistant" },
    });
    expect(saved.content).toBe(replyText(events));
    expect(saved.generationProgress).toBeNull();
  });

  it("structures temporary coding replies without persisting them", async () => {
    state.userId = alice;
    const count = await t.prisma.message.count();
    state.responses = [JSON.stringify({ files: [{ path: "hello.py" }] }), "```py\nprint(1)\n```\n{{MARKER}}"];
    const events = await readSse(await send({ message: "Write code", mode: "coding", temporary: true }));
    expect(replyText(events)).toContain("### `hello.py`");
    expect(events.at(-1)?.event).toBe("done");
    expect(await t.prisma.message.count()).toBe(count);
  });

  it("shows the second file live without saving its incomplete draft", async () => {
    state.userId = alice;
    let release!: () => void;
    state.fileGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    state.responses = [
      JSON.stringify({ files: [{ path: "src/a.ts" }, { path: "src/b.ts" }] }),
      "```ts\nexport const a = 1;\n```\n{{MARKER}}",
      ["```ts\nexport const b = ", "2;\n```\n{{MARKER}}"],
    ];
    const response = await send({ message: "Create src/a.ts and src/b.ts", mode: "coding" });
    const events = readChatStream(response.body!);
    let conversationId = "";
    let sawDraft = false;
    try {
      for await (const event of events) {
        if (event.event === "meta") conversationId = event.data.conversationId!;
        if (event.event === "file-preview" && event.data.path === "src/b.ts" && event.data.text) {
          sawDraft = true;
          expect(event.data.text).toBe("export const b = ");
          const saved = await t.prisma.message.findFirstOrThrow({
            where: { conversationId, role: "assistant" },
          });
          expect(saved.content).toContain("src/a.ts");
          expect(saved.content).not.toContain("export const b =");
          expect(saved.generationProgress).toMatchObject({
            completedFiles: ["src/a.ts"],
            currentFile: "src/b.ts",
          });
          release();
        }
        if (event.event === "done") break;
      }
    } finally {
      release();
    }
    expect(sawDraft).toBe(true);
    const final = await t.prisma.message.findFirstOrThrow({ where: { conversationId, role: "assistant" } });
    expect(final.content).toContain("export const b = 2;");
    expect(final.generationProgress).toBeNull();
  });

  it("generates multi-file coding work one file at a time and resumes from saved checkpoints", async () => {
    state.userId = alice;
    const message = "Build a TypeScript project with src/one.ts and src/two.ts.";
    const firstFile = ["```ts", "export const one = 1;", "```", "{{MARKER}}"].join("\n");
    state.responses = [
      JSON.stringify({
        files: [
          { path: "src/one.ts", purpose: "Export the first value." },
          { path: "src/two.ts", purpose: "Use and extend the first value." },
        ],
      }),
      firstFile,
      new Error("temporary connection failure"),
    ];

    const first = await readSse(await send({ message, mode: "coding" }));
    expect(first.some((event) => event.event === "done")).toBe(false);
    expect(first.find((event) => event.event === "error")?.data.retryable).toBe(true);
    expect(replyText(first)).toContain("### Project structure");
    expect(replyText(first)).toContain("├── one.ts");
    expect(replyText(first)).toContain("└── two.ts");
    expect(replyText(first)).toContain("### `src/one.ts`");
    expect(replyText(first)).not.toContain("### `src/two.ts`");

    const conversationId = first.find((event) => event.event === "meta")!.data.conversationId as string;
    const partial = await t.prisma.message.findFirstOrThrow({
      where: { conversationId, role: "assistant" },
    });
    expect(partial.content).toContain("### `src/one.ts`");
    expect(partial.generationProgress).toMatchObject({
      kind: "multi-file-coding",
      state: "interrupted",
      completedFiles: ["src/one.ts"],
      currentFile: "src/two.ts",
    });
    const interruptedPage = await session.GET(req(`/api/sessions/${conversationId}`), ctx(conversationId));
    const interruptedMessages = (await interruptedPage.json()).messages as {
      role: string;
      complete: boolean;
    }[];
    expect(interruptedMessages.find((message) => message.role === "assistant")?.complete).toBe(false);

    const secondFile = [
      "```ts",
      'import { one } from "./one";',
      "export const two = one + 1;",
      "```",
      "{{MARKER}}",
    ].join("\n");
    state.responses = [secondFile];
    const resumed = await readSse(await send({ message, conversationId, retry: true, mode: "coding" }));
    const restoredText = String(resumed.find((event) => event.event === "meta")?.data.resumeText ?? "");
    expect(restoredText).toBe(partial.content);
    expect((restoredText + replyText(resumed)).split("### Project structure")).toHaveLength(2);
    expect(restoredText + replyText(resumed)).toContain("### `src/one.ts`");
    expect(replyText(resumed)).toContain("### `src/two.ts`");
    expect((restoredText + replyText(resumed)).split("### `src/one.ts`")).toHaveLength(2);
    expect(resumed.some((event) => event.event === "done")).toBe(true);
    expect(state.calls).toHaveLength(4); // plan + two files, then only the unfinished file

    const assistants = await t.prisma.message.findMany({ where: { conversationId, role: "assistant" } });
    expect(assistants).toHaveLength(1);
    expect(assistants[0].generationProgress).toBeNull();
    const completedPage = await session.GET(req(`/api/sessions/${conversationId}`), ctx(conversationId));
    const completedMessages = (await completedPage.json()).messages as { role: string; complete: boolean }[];
    expect(completedMessages.find((message) => message.role === "assistant")?.complete).toBe(true);
    expect(assistants[0].content.split("### `src/one.ts`")).toHaveLength(2);
    expect(assistants[0].content.split("### `src/two.ts`")).toHaveLength(2);
  });

  it("saves two files and resumes the third after bounded format repair fails", async () => {
    state.userId = alice;
    const message = "Create a project with src/a.ts, src/b.ts and src/c.ts.";
    state.responses = [
      JSON.stringify({ files: [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "src/c.ts" }] }),
      "```ts\nexport const a = 1;\n```\n{{MARKER}}",
      "```ts\nexport const b = 2;\n```\n{{MARKER}}",
      "```ts\nconst notFinished = 1;\n```",
      "still incomplete",
      "still incomplete again",
    ];
    const first = await readSse(await send({ message, mode: "coding" }));
    expect(first.some((event) => event.event === "done")).toBe(false);
    expect(first.find((event) => event.event === "error")?.data.message).toContain("src/c.ts");
    expect(first.find((event) => event.event === "error")?.data.message).toContain("saved");
    expect(replyText(first)).not.toContain("notFinished");
    const conversationId = first.find((event) => event.event === "meta")!.data.conversationId as string;
    const saved = await t.prisma.message.findFirstOrThrow({ where: { conversationId, role: "assistant" } });
    expect(saved.generationProgress).toMatchObject({
      state: "interrupted",
      completedFiles: ["src/a.ts", "src/b.ts"],
      currentFile: "src/c.ts",
    });
    state.responses = ["```ts\nexport const c = 3;\n```\n{{MARKER}}"];
    const resumed = await readSse(await send({ message, conversationId, retry: true, mode: "coding" }));
    expect(resumed.some((event) => event.event === "done")).toBe(true);
    expect(replyText(resumed)).toContain("src/c.ts");
    const final = await t.prisma.message.findUniqueOrThrow({ where: { id: saved.id } });
    expect(final.generationProgress).toBeNull();
    for (const path of ["src/a.ts", "src/b.ts", "src/c.ts"])
      expect(final.content.split(`### \`${path}\``)).toHaveLength(2);
  });

  it("only adds trusted instructions for an installed, enabled skill", async () => {
    state.userId = alice;
    const installation = await t.prisma.userSkill.create({
      data: { userId: alice, skillId: "coding-assistant", enabled: false },
    });

    const disabled = await send({ message: "Review this code", skills: ["coding-assistant"] });
    expect(disabled.status).toBe(400);
    expect((await disabled.json()).error.code).toBe("skill_not_enabled");
    expect(state.calls).toHaveLength(0);

    await t.prisma.userSkill.update({
      where: { userId_skillId: { userId: installation.userId, skillId: installation.skillId } },
      data: { enabled: true },
    });
    const unselected = await send({ message: "Review this code", skills: ["coding-assistant"] });
    expect(unselected.status).toBe(400);
    expect((await unselected.json()).error.code).toBe("skill_not_selected");
    expect(state.calls).toHaveLength(0);

    await t.prisma.userSkill.update({
      where: { userId_skillId: { userId: installation.userId, skillId: installation.skillId } },
      data: { selected: true },
    });
    await readSse(await send({ message: "Review this code", skills: ["coding-assistant"] }));
    expect(state.calls[0].system).toContain("Act as a careful coding partner");
    expect(state.calls[0].system).toContain("No external tools are available to this skill.");
  });

  it("saves partial streamed replies as incomplete and resumes without duplicating text", async () => {
    state.userId = alice;
    const message = "Explain the design.";
    state.stream = [{ type: "text", text: "The saved prefix." }, new Error("temporary stream interruption")];

    const first = await readSse(await send({ message }));
    expect(first.some((event) => event.event === "done")).toBe(false);
    const conversationId = first.find((event) => event.event === "meta")!.data.conversationId as string;
    const partial = await t.prisma.message.findFirstOrThrow({
      where: { conversationId, role: "assistant" },
    });
    expect(partial.content).toBe("The saved prefix.");
    expect(partial.generationProgress).toMatchObject({ kind: "stream", state: "interrupted" });

    state.stream = [{ type: "text", text: " The remaining explanation." }];
    const resumed = await readSse(await send({ message, conversationId, retry: true }));
    expect(resumed.find((event) => event.event === "meta")?.data.resumeText).toBe(partial.content);
    expect(resumed.some((event) => event.event === "done")).toBe(true);

    const saved = await t.prisma.message.findMany({ where: { conversationId, role: "assistant" } });
    expect(saved).toHaveLength(1);
    expect(saved[0].generationProgress).toBeNull();
    expect(saved[0].content).toBe("The saved prefix. The remaining explanation.");
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

  it("can format a guest Coding reply without saving it", async () => {
    const before = await t.prisma.message.count();
    state.responses = [
      JSON.stringify({ files: [{ path: "src/app.js" }] }),
      "```js\nconsole.log(1)\n```\n{{MARKER}}",
    ];
    const events = await readSse(await send({ message: "Write code", mode: "coding" }));
    expect(replyText(events)).toContain("### `src/app.js`");
    expect(events.at(-1)?.event).toBe("done");
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

describe("POST /api/chat — context, reasoning and clean answers", () => {
  it("sends the last 20 messages of the conversation, not just the newest", async () => {
    state.userId = alice;
    // 25 older messages in one chat.
    const convo = await t.prisma.conversation.create({ data: { userId: alice, title: "Long chat" } });
    const base = Date.now();
    await t.prisma.message.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        conversationId: convo.id,
        role: i % 2 ? ("assistant" as const) : ("user" as const),
        content: `older-${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    });

    await readSse(await send({ message: "And now?", conversationId: convo.id }));

    const history = state.calls[0].history ?? [];
    expect(history).toHaveLength(20);
    expect(history[0].content).toBe("older-5");
    expect(history.at(-1)!.content).toBe("older-24");
    // The newest message travels separately (so it is never duplicated).
    expect(history.some((m) => m.content === "And now?")).toBe(false);
  });

  it("lets the guest demo send its own recent turns", async () => {
    const turns = [
      { role: "user" as const, content: "first" },
      { role: "assistant" as const, content: "reply" },
    ];
    await readSse(await send({ message: "follow up", history: turns }, freshIp()));
    expect(state.calls[0].history).toEqual(turns);
  });

  it("never sends or saves reasoning unless the user asked for it", async () => {
    state.userId = alice;
    state.stream = [
      { type: "reasoning", text: "The user wants a short answer." },
      { type: "text", text: "Use a Map." },
    ];

    // Default: reasoning is dropped on the server.
    const quiet = await readSse(await send({ message: "Which collection?" }));
    expect(reasoningText(quiet)).toBe("");
    expect(replyText(quiet)).toBe("Use a Map.");
    expect(state.calls[0].showReasoning).toBe(false);

    // Opt-in: reasoning is streamed, but still not stored.
    const loud = await readSse(await send({ message: "Which collection?", showReasoning: true }));
    expect(reasoningText(loud)).toBe("The user wants a short answer.");
    expect(replyText(loud)).toBe("Use a Map.");

    const saved = await t.prisma.message.findMany({ where: { role: "assistant" } });
    expect(saved.every((m) => !m.content.includes("The user wants"))).toBe(true);
  });

  it("strips filler from the streamed text and from what is saved", async () => {
    state.userId = alice;
    state.reply = "Great question! Use a Map for key → value pairs. I hope this helps!";
    const events = await readSse(await send({ message: "Map or object?" }));

    const streamed = replyText(events);
    expect(streamed).toBe("Use a Map for key → value pairs.");
    const done = events.find((e) => e.event === "done")!.data;
    expect(done.text).toBe("Use a Map for key → value pairs.");

    const id = events.find((e) => e.event === "meta")!.data.conversationId as string;
    const saved = await t.prisma.message.findFirstOrThrow({
      where: { conversationId: id, role: "assistant" },
    });
    expect(saved.content).toBe("Use a Map for key → value pairs.");
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

// ── Skills marketplace ─────────────────────────────────────────────
describe("/api/skills", () => {
  const postSkill = (body: unknown) =>
    mutateSkill(req("/api/skills", { method: "POST", body, ip: freshIp() }), undefined);

  it("requires login for catalog and installation state", async () => {
    expect((await getSkills(req("/api/skills"), undefined)).status).toBe(401);
  });

  it("returns the trusted catalog and persists install, enable, selection, and uninstall state", async () => {
    state.userId = alice;
    const catalog = await (await getSkills(req("/api/skills"), undefined)).json();
    expect(catalog.skills).toHaveLength(10);
    expect(catalog.skills[0]).toMatchObject({
      id: "coding-assistant",
      installed: false,
      enabled: false,
      selected: false,
    });
    expect(catalog.skills[0]).not.toHaveProperty("instructions");

    const installed = await postSkill({ action: "install", skillId: "coding-assistant" });
    expect(await installed.json()).toMatchObject({
      skillId: "coding-assistant",
      installed: true,
      enabled: true,
      selected: false,
    });

    const selected = await (
      await postSkill({
        action: "set-selected",
        skillId: "coding-assistant",
        selected: true,
      })
    ).json();
    expect(selected).toMatchObject({ enabled: true, selected: true });

    await postSkill({ action: "set-enabled", skillId: "coding-assistant", enabled: false });
    const disabledSelection = await postSkill({
      action: "set-selected",
      skillId: "coding-assistant",
      selected: true,
    });
    expect(disabledSelection.status).toBe(400);
    // Repeated install is idempotent and must not re-enable a skill the user disabled.
    const repeated = await (await postSkill({ action: "install", skillId: "coding-assistant" })).json();
    expect(repeated).toMatchObject({ installed: true, enabled: false });

    const stateAfter = await (await getSkills(req("/api/skills"), undefined)).json();
    expect(stateAfter.skills[0]).toMatchObject({ installed: true, enabled: false, selected: false });

    const removed = await (await postSkill({ action: "uninstall", skillId: "coding-assistant" })).json();
    expect(removed).toMatchObject({ installed: false, enabled: false, selected: false });
    expect(await t.prisma.userSkill.count({ where: { userId: alice } })).toBe(0);
  });

  it("only selects enabled installations and enforces the three-skill Settings limit", async () => {
    state.userId = alice;
    const ids = ["coding-assistant", "writing-assistant", "mathematics", "productivity"];
    await t.prisma.userSkill.createMany({
      data: ids.map((skillId) => ({ userId: alice, skillId, enabled: true, selected: false })),
    });

    for (const skillId of ids.slice(0, 3)) {
      const response = await postSkill({ action: "set-selected", skillId, selected: true });
      expect(response.status).toBe(200);
    }
    const overLimit = await postSkill({ action: "set-selected", skillId: ids[3], selected: true });
    expect(overLimit.status).toBe(400);
    expect((await overLimit.json()).error).toMatchObject({ code: "bad_request" });
    expect(await t.prisma.userSkill.count({ where: { userId: alice, selected: true } })).toBe(3);
  });

  it("rejects IDs that are not in the built-in catalog", async () => {
    state.userId = alice;
    const response = await postSkill({ action: "install", skillId: "remote-untrusted-skill" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("validation_error");
    expect(await t.prisma.userSkill.count({ where: { userId: alice } })).toBe(0);
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
