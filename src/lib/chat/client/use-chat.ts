"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { MessagesPage, SessionSummary } from "../types";
import { api, ClientApiError } from "./api";
import { chatReducer, DRAFT, initialChatState, type UiMessage } from "./chat-state";
import { streamChat } from "./stream-chat";

type Notify = (message: string, kind?: "info" | "success" | "error") => void;

const tempId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

/**
 * Everything the chat screen needs: data + actions (send, stop, retry,
 * switch chat, rename, delete…). Components stay simple and just call these.
 */
export function useChat({
  initialSessions,
  initialNextCursor,
  initialActiveId,
  initialActivePage,
  notify,
}: {
  initialSessions: SessionSummary[];
  initialNextCursor: string | null;
  initialActiveId: string | null;
  initialActivePage: MessagesPage | null;
  notify: Notify;
}) {
  const [state, dispatch] = useReducer(
    chatReducer,
    {
      sessions: initialSessions,
      nextCursor: initialNextCursor,
      activeId: initialActiveId,
      activePage: initialActivePage,
    },
    initialChatState,
  );
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Keep the address bar in sync (?c=<id>) so a refresh reopens the same chat.
  useEffect(() => {
    const url = state.activeKey === DRAFT ? "/app" : `/app?c=${encodeURIComponent(state.activeKey)}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [state.activeKey]);

  // Stop any reply in progress if the user leaves the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadConversation = useCallback(
    async (id: string) => {
      dispatch({ type: "conversationLoading", key: id });
      try {
        const page = await api.getMessages(id);
        dispatch({ type: "conversationLoaded", key: id, page });
      } catch (error) {
        dispatch({ type: "conversationFailed", key: id });
        if (error instanceof ClientApiError && error.status === 404) {
          dispatch({ type: "deleted", id });
          notify("That chat no longer exists.", "error");
        } else {
          notify((error as Error).message, "error");
        }
      }
    },
    [notify],
  );

  const select = useCallback(
    (id: string) => {
      const existing = stateRef.current.conversations[id];
      dispatch({ type: "select", key: id });
      if (!existing || existing.status === "error") void loadConversation(id);
    },
    [loadConversation],
  );

  const newChat = useCallback(() => dispatch({ type: "newChat" }), []);

  /** Core: stream a reply into conversation `key`. */
  const run = useCallback(
    async ({
      key,
      text,
      attachments,
      retryOf,
    }: {
      key: string;
      text: string;
      attachments: { name: string; content: string }[];
      retryOf?: string;
    }) => {
      const now = new Date().toISOString();
      const userTemp = tempId("tmp-user");
      const assistantId = tempId("tmp-ai");
      const assistant: UiMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        attachments: null,
        latencyMs: null,
        createdAt: now,
        status: "streaming",
        phase: "thinking",
        fresh: true,
        clientKey: assistantId,
      };
      const user: UiMessage | undefined = retryOf
        ? undefined
        : {
            id: userTemp,
            role: "user",
            content: text,
            attachments: attachments.length
              ? attachments.map((a) => ({
                  name: a.name,
                  size: new TextEncoder().encode(a.content).length,
                  language: "",
                }))
              : null,
            latencyMs: null,
            createdAt: now,
            fresh: true,
            clientKey: userTemp,
            outgoing: attachments.length ? attachments : undefined,
          };

      dispatch({ type: "sendStart", key, user, assistant, replaceId: retryOf });

      const controller = new AbortController();
      abortRef.current = controller;
      let currentKey = key;

      await streamChat(
        {
          message: text,
          conversationId: key === DRAFT ? undefined : key,
          attachments: attachments.length ? attachments : undefined,
          retry: retryOf ? true : undefined,
        },
        {
          signal: controller.signal,
          onMeta: (meta) => {
            dispatch({
              type: "meta",
              key: currentKey,
              conversationId: meta.conversationId,
              title: meta.title,
              userTempId: user ? userTemp : undefined,
              userMessageId: meta.userMessageId,
              retry: Boolean(retryOf),
            });
            if (meta.conversationId) currentKey = meta.conversationId;
          },
          onStatus: (s) =>
            dispatch({ type: "phase", key: currentKey, id: assistantId, phase: s.state, message: s.message }),
          onText: (t) => dispatch({ type: "append", key: currentKey, id: assistantId, text: t }),
          onDone: (d) => {
            dispatch({
              type: "done",
              key: currentKey,
              id: assistantId,
              newId: d.messageId,
              latencyMs: d.latencyMs,
            });
            setLastLatency(d.latencyMs);
          },
          onError: (e) => {
            dispatch({ type: "failed", key: currentKey, id: assistantId, error: e });
            if (e.code === "rate_limited" || e.code === "unauthorized") notify(e.message, "error");
          },
          onAbort: () => dispatch({ type: "stopped", key: currentKey, id: assistantId }),
        },
      );
      if (abortRef.current === controller) abortRef.current = null;
    },
    [notify],
  );

  const send = useCallback(
    async (text: string, attachments: { name: string; content: string }[] = []) => {
      const trimmed = text.trim();
      if (!trimmed || stateRef.current.streamingKey) return false;
      await run({ key: stateRef.current.activeKey, text: trimmed, attachments });
      return true;
    },
    [run],
  );

  /** "Try again" on a failed or stopped reply. */
  const retry = useCallback(
    async (assistantId: string) => {
      const s = stateRef.current;
      if (s.streamingKey) return;
      const key = s.activeKey;
      const messages = s.conversations[key]?.messages ?? [];
      const index = messages.findIndex((m) => m.id === assistantId);
      const userMessage = messages.slice(0, index).findLast((m) => m.role === "user");
      if (!userMessage) return;
      // `retry: true` tells the server "don't save my message twice". If it was
      // never saved (e.g. you were offline), the server simply saves it now.
      await run({
        key,
        text: userMessage.content,
        attachments: userMessage.outgoing ?? [],
        retryOf: assistantId,
      });
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const loadOlder = useCallback(async () => {
    const s = stateRef.current;
    const key = s.activeKey;
    const conv = s.conversations[key];
    if (!conv || key === DRAFT || !conv.hasMore || conv.loadingOlder || !conv.nextBefore) return;
    dispatch({ type: "olderLoading", key });
    try {
      const page = await api.getMessages(key, conv.nextBefore);
      dispatch({ type: "olderLoaded", key, page });
    } catch (error) {
      dispatch({ type: "olderLoaded", key, page: null });
      notify((error as Error).message, "error");
    }
  }, [notify]);

  const loadMoreSessions = useCallback(async () => {
    const cursor = stateRef.current.nextCursor;
    if (!cursor) return;
    try {
      const { sessions, nextCursor } = await api.listSessions(cursor);
      dispatch({ type: "sessionsLoaded", sessions, nextCursor, append: true });
    } catch (error) {
      notify((error as Error).message, "error");
    }
  }, [notify]);

  const rename = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim().slice(0, 120);
      const before = stateRef.current.sessions.find((s) => s.id === id)?.title;
      if (!clean || clean === before) return;
      dispatch({ type: "renamed", id, title: clean });
      try {
        await api.renameSession(id, clean);
      } catch (error) {
        if (before) dispatch({ type: "renamed", id, title: before });
        notify((error as Error).message, "error");
      }
    },
    [notify],
  );

  const remove = useCallback(
    async (id: string) => {
      if (stateRef.current.streamingKey === id) abortRef.current?.abort();
      try {
        await api.deleteSession(id);
        dispatch({ type: "deleted", id });
        notify("Chat deleted.", "success");
      } catch (error) {
        notify((error as Error).message, "error");
      }
    },
    [notify],
  );

  const clearAll = useCallback(async () => {
    abortRef.current?.abort();
    try {
      const { deleted } = await api.clearAll();
      dispatch({ type: "clearedAll" });
      notify(
        deleted ? `Deleted ${deleted} chat${deleted === 1 ? "" : "s"}.` : "No chats to delete.",
        "success",
      );
      return true;
    } catch (error) {
      notify((error as Error).message, "error");
      return false;
    }
  }, [notify]);

  const active = state.conversations[state.activeKey];
  const activeSession = state.sessions.find((s) => s.id === state.activeKey) ?? null;

  return {
    state,
    active,
    activeSession,
    isStreaming: state.streamingKey !== null,
    lastLatency,
    select,
    newChat,
    send,
    retry,
    stop,
    loadOlder,
    loadMoreSessions,
    rename,
    remove,
    clearAll,
    reloadActive: () => state.activeKey !== DRAFT && loadConversation(state.activeKey),
  };
}

export type UseChat = ReturnType<typeof useChat>;
