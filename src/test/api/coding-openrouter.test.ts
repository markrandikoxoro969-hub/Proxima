// @vitest-environment node
/** Full chat route + Prisma/PGlite + OpenRouter-compatible streaming, with a simulated upstream. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/test-db";
import { readSse, replyText, req } from "./helpers";
import { resetAiProviderCache } from "@/lib/ai";

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(state.db as object, prop) }),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (state.userId ? { user: { id: state.userId } } : null)),
}));
const { POST } = await import("@/app/api/chat/route");
let db: TestDb;
let userId: string;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db.prisma;
  userId = (await db.prisma.user.create({ data: { email: "coding-test@example.com" } })).id;
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  state.userId = userId;
  await db.prisma.rateLimit.deleteMany();
});

describe("multi-file OpenRouter coding end to end", () => {
  it("repairs the third file after two files, retaining long context and saving every file", async () => {
    vi.stubEnv("AI_PROVIDER", "render");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-fake-key");
    const bodies: { model: string; max_tokens: number; messages: { role: string; content: string }[] }[] = [];
    let count = 0;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      count += 1;
      const marker = body.messages[0].content.match(
        /Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/,
      )?.[1];
      let content: string;
      if (count === 1)
        content = JSON.stringify({
          files: [
            { path: "src/one.ts", purpose: "One" },
            { path: "src/two.ts", purpose: "Two" },
            { path: "src/three.ts", purpose: "Three" },
          ],
        });
      else if (count === 2)
        content = `\`\`\`ts\n// ${"x".repeat(13_000)}\nexport const one = 1;\n\`\`\`\n${marker}`;
      else if (count === 3) content = `\`\`\`ts\nexport const two = 2;\n\`\`\`\n${marker}`;
      else if (count === 4) content = "```ts\nexport const three = 3;\n```";
      else content = `\`\`\`ts\nexport const three = 3;\n\`\`\`\n${marker}`;
      const delta = JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] });
      return new Response(`data: ${delta}\n\ndata: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    resetAiProviderCache();
    try {
      const response = await POST(
        req("/api/chat", {
          method: "POST",
          body: { message: "Build a project with src/one.ts, src/two.ts and src/three.ts", mode: "coding" },
        }),
        undefined,
      );
      const events = await readSse(response);
      expect(events.some((event) => event.event === "error")).toBe(false);
      expect(events.some((event) => event.event === "done")).toBe(true);
      expect(
        events.some(
          (event) => event.event === "status" && String(event.data.message).includes("Fixing the format"),
        ),
      ).toBe(true);
      const text = replyText(events);
      for (const path of ["src/one.ts", "src/two.ts", "src/three.ts"])
        expect(text.split(`### \`${path}\``)).toHaveLength(2);
      expect(text).not.toContain("PROXIMA_FILE_COMPLETE");
      expect(bodies).toHaveLength(5);
      for (const body of bodies) {
        expect(body.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
        expect(body.max_tokens).toBe(65_536);
      }
      const thirdRequest = bodies[3].messages.at(-1)!.content;
      expect(thirdRequest).toContain("export const one = 1;");
      expect(thirdRequest).toContain("export const two = 2;");
      expect(bodies[4].messages.at(-1)!.content).toContain("Previous attempt (unverified");
      const id = events.find((event) => event.event === "meta")!.data.conversationId as string;
      const saved = await db.prisma.message.findFirstOrThrow({
        where: { conversationId: id, role: "assistant" },
      });
      expect(saved.generationProgress).toBeNull();
      expect(saved.content).toBe(text);
    } finally {
      fetch.mockRestore();
      vi.unstubAllEnvs();
      resetAiProviderCache();
    }
  });
});
