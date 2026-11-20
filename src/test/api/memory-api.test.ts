// @vitest-environment node
/**
 * Memory end to end: a fact mentioned in one chat is remembered, shows up in
 * the system prompt of a *later* chat, is listed for Settings, and can be
 * wiped. Real Postgres (in memory), fake AI, fake login.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/test-db";
import { ORIGIN, readSse, req } from "./helpers";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  systems: [] as (string | undefined)[],
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
      async complete(request: { system?: string }) {
        state.systems.push(request.system);
        return "Got it.";
      },
    }),
  };
});

const chatRoute = await import("@/app/api/chat/route");
const memoryRoute = await import("@/app/api/memory/route");

type Empty = Record<string, never>;
const chat = (request: Request) => chatRoute.POST(request, {} as Empty);
const readMemory = (request: Request) => memoryRoute.GET(request, {} as Empty);
const clearMemory = (request: Request) => memoryRoute.DELETE(request, {} as Empty);

let testDb: TestDb;
let userId: string;

const send = (message: string) => chat(req("/api/chat", { method: "POST", body: { message } }));

beforeAll(async () => {
  testDb = await createTestDb();
  state.db = testDb.prisma;
  userId = (await testDb.prisma.user.create({ data: { email: "memory@example.com" }, select: { id: true } }))
    .id;
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  state.userId = userId;
  state.systems = [];
  await testDb.prisma.rateLimit.deleteMany();
  await testDb.prisma.user.update({
    where: { id: userId },
    data: { memoryNotes: null, memoryUpdatedAt: null },
  });
});

describe("memory", () => {
  it("remembers a fact from one chat and uses it in a later one", async () => {
    const first = await send("1 day ago I'm going to gym");
    expect(first.status).toBe(200);
    await readSse(first);
    // The message is learned *before* the reply, so even this answer can use it.
    expect(state.systems[0]).toContain("going to gym");

    const stored = await testDb.prisma.user.findUnique({
      where: { id: userId },
      select: { memoryNotes: true },
    });
    expect(stored?.memoryNotes).toMatch(/going to gym/);

    const second = await send("which protein is good");
    await readSse(second);
    // The next chat carries the memory in its system prompt.
    expect(state.systems[1]).toContain("going to gym");
    expect(state.systems[1]).toContain("never invent a memory");
  });

  it("lists what is remembered and wipes it on request", async () => {
    await readSse(await send("I am training for a half marathon"));
    const listed = await readMemory(req("/api/memory"));
    const body = await listed.json();
    expect(body.notes).toMatch(/half marathon/);
    expect(body.updatedAt).toBeTruthy();

    const cleared = await clearMemory(req("/api/memory", { method: "DELETE", headers: { origin: ORIGIN } }));
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ cleared: true });

    const after = await readMemory(req("/api/memory"));
    expect((await after.json()).notes).toBeNull();
  });

  it("requires sign-in", async () => {
    state.userId = null;
    expect((await readMemory(req("/api/memory"))).status).toBe(401);
    const cleared = await clearMemory(req("/api/memory", { method: "DELETE", headers: { origin: ORIGIN } }));
    expect(cleared.status).toBe(401);
  });

  it("does not remember credentials", async () => {
    await readSse(await send("my password is hunter2"));
    const stored = await testDb.prisma.user.findUnique({
      where: { id: userId },
      select: { memoryNotes: true },
    });
    expect(stored?.memoryNotes).toBeNull();
  });
});
