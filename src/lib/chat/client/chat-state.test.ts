import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../types";
import { chatReducer, DRAFT, initialChatState, type ChatState, type UiMessage } from "./chat-state";

const now = "2026-11-19T10:00:00.000Z";
const session = (id: string, title = id): SessionSummary => ({
  id,
  title,
  messageCount: 2,
  createdAt: now,
  updatedAt: now,
});
const msg = (
  id: string,
  role: "user" | "assistant",
  content = "",
  extra: Partial<UiMessage> = {},
): UiMessage => ({
  id,
  role,
  content,
  attachments: null,
  latencyMs: null,
  complete: true,
  createdAt: now,
  ...extra,
});

const start = (): ChatState =>
  initialChatState({
    sessions: [session("a"), session("b")],
    nextCursor: null,
    activeId: null,
    activePage: null,
  });

describe("chatReducer", () => {
  it("turns a draft into a saved chat when the server confirms it", () => {
    let s = start();
    s = chatReducer(s, {
      type: "sendStart",
      key: DRAFT,
      user: msg("tmp-user-1", "user", "Hello", { clientKey: "tmp-user-1" }),
      assistant: msg("tmp-ai-1", "assistant", "", { status: "streaming", clientKey: "tmp-ai-1" }),
    });
    expect(s.streamingKey).toBe(DRAFT);

    s = chatReducer(s, {
      type: "meta",
      key: DRAFT,
      conversationId: "c1",
      title: "Hello",
      answerMode: "coding",
      userTempId: "tmp-user-1",
      userMessageId: "u1",
    });
    expect(s.activeKey).toBe("c1");
    expect(s.streamingKey).toBe("c1");
    expect(s.conversations[DRAFT]).toBeUndefined();
    expect(s.sessions[0]).toMatchObject({ id: "c1", title: "Hello", messageCount: 1 });
    expect(s.conversations.c1.messages[0]).toMatchObject({ id: "u1", clientKey: "tmp-user-1" });
    expect(s.conversations.c1.messages[1].mode).toBe("coding");

    s = chatReducer(s, { type: "append", key: "c1", id: "tmp-ai-1", text: "Hi " });
    s = chatReducer(s, { type: "append", key: "c1", id: "tmp-ai-1", text: "there" });
    s = chatReducer(s, { type: "done", key: "c1", id: "tmp-ai-1", newId: "m2", latencyMs: 900 });

    const reply = s.conversations.c1.messages[1];
    expect(reply).toMatchObject({ id: "m2", content: "Hi there", latencyMs: 900, clientKey: "tmp-ai-1" });
    expect(reply.status).toBeUndefined();
    expect(s.streamingKey).toBeNull();
    expect(s.sessions[0]).toMatchObject({ id: "c1", messageCount: 2 });
  });

  it.each(["failed", "stopped", "done"] as const)("discards an unsaved draft on %s", (ending) => {
    let s = start();
    s = chatReducer(s, {
      type: "sendStart",
      key: DRAFT,
      assistant: msg("ai", "assistant", "saved file", { status: "streaming" }),
    });
    s = chatReducer(s, { type: "filePreview", key: DRAFT, id: "ai", path: "src/two.ts", text: "unverified" });
    expect(s.conversations[DRAFT].messages[0]).toMatchObject({
      content: "saved file",
      filePreview: { text: "unverified" },
    });
    if (ending === "done")
      s = chatReducer(s, {
        type: "done",
        key: DRAFT,
        id: "ai",
        newId: null,
        latencyMs: 1,
        text: "saved file",
      });
    else if (ending === "failed")
      s = chatReducer(s, {
        type: "failed",
        key: DRAFT,
        id: "ai",
        error: { code: "timeout", message: "timeout", retryable: true },
      });
    else s = chatReducer(s, { type: "stopped", key: DRAFT, id: "ai" });
    expect(s.conversations[DRAFT].messages[0].filePreview).toBeUndefined();
    expect(s.conversations[DRAFT].messages[0].content).toBe("saved file");
  });

  it("moves an existing chat to the top when you message it", () => {
    let s = start();
    s = chatReducer(s, { type: "select", key: "b" });
    s = chatReducer(s, {
      type: "conversationLoaded",
      key: "b",
      page: { messages: [], hasMore: false, nextBefore: null },
    });
    s = chatReducer(s, {
      type: "sendStart",
      key: "b",
      user: msg("tmp-user-2", "user", "x"),
      assistant: msg("tmp-ai-2", "assistant"),
    });
    s = chatReducer(s, {
      type: "meta",
      key: "b",
      conversationId: "b",
      title: "b",
      userTempId: "tmp-user-2",
      userMessageId: "u9",
    });
    expect(s.sessions.map((x) => x.id)).toEqual(["b", "a"]);
    expect(s.sessions[0].messageCount).toBe(3);
  });

  it("marks a failed reply and lets a retry replace it without duplicating the question", () => {
    let s = start();
    s = chatReducer(s, {
      type: "sendStart",
      key: DRAFT,
      user: msg("tmp-user-3", "user", "Q"),
      assistant: msg("tmp-ai-3", "assistant"),
    });
    s = chatReducer(s, {
      type: "failed",
      key: DRAFT,
      id: "tmp-ai-3",
      error: { code: "timeout", message: "Too slow", retryable: true },
    });
    expect(s.conversations[DRAFT].messages[1]).toMatchObject({ status: "error", error: { code: "timeout" } });
    expect(s.streamingKey).toBeNull();

    s = chatReducer(s, {
      type: "sendStart",
      key: DRAFT,
      assistant: msg("tmp-ai-4", "assistant"),
      replaceId: "tmp-ai-3",
    });
    expect(s.conversations[DRAFT].messages.map((m) => m.id)).toEqual(["tmp-user-3", "tmp-ai-4"]);
  });

  it("restores interrupted saved replies as retryable incomplete messages", () => {
    const s = initialChatState({
      sessions: [session("a")],
      nextCursor: null,
      activeId: "a",
      activePage: {
        messages: [
          msg("u1", "user", "Build a project"),
          msg("a1", "assistant", "Completed file was saved.", { complete: false }),
        ],
        hasMore: false,
        nextBefore: null,
      },
    });

    expect(s.conversations.a.messages[1]).toMatchObject({
      complete: false,
      status: "error",
      error: {
        code: "interrupted",
        retryable: true,
        message: expect.stringContaining("Saved progress is preserved"),
      },
    });
  });

  it("prepends older messages without duplicates", () => {
    let s = start();
    s = chatReducer(s, { type: "select", key: "a" });
    s = chatReducer(s, {
      type: "conversationLoaded",
      key: "a",
      page: { messages: [msg("m3", "user"), msg("m4", "assistant")], hasMore: true, nextBefore: "m3" },
    });
    s = chatReducer(s, { type: "olderLoading", key: "a" });
    s = chatReducer(s, {
      type: "olderLoaded",
      key: "a",
      page: {
        messages: [msg("m1", "user"), msg("m2", "assistant"), msg("m3", "user")],
        hasMore: false,
        nextBefore: null,
      },
    });
    expect(s.conversations.a.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(s.conversations.a).toMatchObject({ hasMore: false, loadingOlder: false });
  });

  it("deleting the open chat returns to a fresh New Chat", () => {
    let s = start();
    s = chatReducer(s, { type: "select", key: "a" });
    s = chatReducer(s, { type: "deleted", id: "a" });
    expect(s.activeKey).toBe(DRAFT);
    expect(s.sessions.map((x) => x.id)).toEqual(["b"]);
  });

  it("clear all empties the sidebar", () => {
    const s = chatReducer(start(), { type: "clearedAll" });
    expect(s.sessions).toEqual([]);
    expect(s.activeKey).toBe(DRAFT);
  });

  it("renames in place", () => {
    const s = chatReducer(start(), { type: "renamed", id: "b", title: "Physics notes" });
    expect(s.sessions[1].title).toBe("Physics notes");
  });

  it("records pending approval on approvalRequired and stops streaming cleanly", () => {
    let s = start();
    s = chatReducer(s, {
      type: "sendStart",
      key: DRAFT,
      user: msg("tmp-u1", "user", "/agent cleanup"),
      assistant: msg("tmp-a1", "assistant"),
    });
    s = chatReducer(s, {
      type: "approvalRequired",
      key: DRAFT,
      id: "tmp-a1",
      approval: {
        stepId: "step-1",
        title: "Delete old draft",
        toolName: "delete_draft",
        conversationId: "c1",
      },
    });
    expect(s.streamingKey).toBeNull();
    expect(s.conversations[DRAFT].messages[1]).toMatchObject({
      status: "stopped",
      pendingApproval: { stepId: "step-1", toolName: "delete_draft" },
    });
  });
});
