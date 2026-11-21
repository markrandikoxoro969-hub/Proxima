// @vitest-environment node
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { AdapterAccount } from "next-auth/adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/test-db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.close();
});

describe("database migrations", () => {
  it("create every table", async () => {
    const { rows } = await t.pglite.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "Account",
      "Conversation",
      "ImageAsset",
      "Message",
      "RateLimit",
      "Session",
      "User",
      "UserMemory",
      "UserSkill",
      "VerificationToken",
    ]);
  });

  it("create the indexes that keep the sidebar and chats fast", async () => {
    const { rows } = await t.pglite.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "User_email_key",
        "Conversation_userId_updatedAt_idx",
        "Message_conversationId_createdAt_idx",
        "RateLimit_windowStart_idx",
        "UserSkill_userId_enabled_idx",
        "Session_sessionToken_key",
      ]),
    );
  });
});

describe("Prisma client ↔ schema", () => {
  it("stores a user, conversation and messages with all fields", async () => {
    const user = await t.prisma.user.create({
      data: {
        email: "sujan@example.com",
        name: "Sujan",
        displayName: "Sujan",
        age: 21,
        onboardedAt: new Date(),
      },
    });
    expect(user.theme).toBe("dark");
    expect(user.particles).toBe(true);

    const convo = await t.prisma.conversation.create({ data: { userId: user.id } });
    expect(convo.title).toBe("New Chat Session");

    await t.prisma.message.createMany({
      data: [
        {
          conversationId: convo.id,
          role: "user",
          content: "Hello",
          attachments: [{ name: "a.py", size: 10 }],
        },
        { conversationId: convo.id, role: "assistant", content: "Hi!", latencyMs: 420 },
      ],
    });
    const messages = await t.prisma.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].attachments).toEqual([{ name: "a.py", size: 10 }]);
  });

  it("deleting a user deletes their chats too (cascade)", async () => {
    const user = await t.prisma.user.create({ data: { email: "cascade@example.com" } });
    const convo = await t.prisma.conversation.create({
      data: { userId: user.id, messages: { create: { role: "user", content: "bye" } } },
    });
    await t.prisma.userMemory.create({
      data: {
        userId: user.id,
        text: "training for a marathon",
        category: "fitness",
        key: "training for a marathon",
      },
    });
    await t.prisma.userSkill.create({
      data: { userId: user.id, skillId: "coding-assistant", enabled: false },
    });
    await t.prisma.user.delete({ where: { id: user.id } });
    expect(await t.prisma.conversation.findUnique({ where: { id: convo.id } })).toBeNull();
    expect(await t.prisma.message.count({ where: { conversationId: convo.id } })).toBe(0);
    expect(
      await t.prisma.userSkill.findUnique({
        where: { userId_skillId: { userId: user.id, skillId: "coding-assistant" } },
      }),
    ).toBeNull();
  });

  it("rejects a display name longer than 40 characters", async () => {
    await expect(t.prisma.user.create({ data: { displayName: "x".repeat(41) } })).rejects.toThrow();
  });
});

describe("Auth.js Prisma adapter (Google sign-in flow)", () => {
  it("creates a user, links the Google account and finds it again", async () => {
    const adapter = PrismaAdapter(t.prisma);
    const created = await adapter.createUser!({
      id: "ignored",
      email: "google-user@example.com",
      emailVerified: null,
      name: "Google User",
      image: "https://lh3.googleusercontent.com/a/photo",
    });
    expect(created.id).not.toBe("ignored"); // database makes its own id

    const account: AdapterAccount = {
      userId: created.id,
      type: "oidc",
      provider: "google",
      providerAccountId: "1234567890",
      access_token: "token",
      token_type: "bearer",
      scope: "openid email profile",
      id_token: "id-token",
      expires_at: 1_900_000_000,
    };
    await adapter.linkAccount!(account);

    const found = await adapter.getUserByAccount!({ provider: "google", providerAccountId: "1234567890" });
    expect(found?.email).toBe("google-user@example.com");
  });

  it("stores and consumes email magic-link tokens once (ready for later)", async () => {
    const adapter = PrismaAdapter(t.prisma);
    const expires = new Date(Date.now() + 60_000);
    await adapter.createVerificationToken!({ identifier: "a@b.co", token: "tok", expires });
    expect(await adapter.useVerificationToken!({ identifier: "a@b.co", token: "tok" })).toMatchObject({
      identifier: "a@b.co",
    });
    expect(await adapter.useVerificationToken!({ identifier: "a@b.co", token: "tok" })).toBeNull();
  });
});
