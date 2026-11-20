import type { ChatMode } from "@/lib/ai/modes";
import type { ChatMessageDTO, MessagesPage, SessionSummary } from "../types";

/**
 * All chat data the /app screen shows, and every way it can change.
 * A "reducer" is a plain function (state, action) → new state, which makes
 * the logic easy to test without a browser.
 */
export const DRAFT = "draft"; // the "New Chat" that isn't saved until the first message

export type StreamPhase = "thinking" | "waking" | "streaming";

export type UiMessage = ChatMessageDTO & {
  /** streaming = reply arriving, error = failed, stopped = user pressed Stop */
  status?: "streaming" | "error" | "stopped";
  phase?: StreamPhase;
  statusMessage?: string;
  error?: { code: string; message: string; retryable: boolean };
  /** Stable key for the list (the id changes when the server confirms the message). */
  clientKey?: string;
  /** Added during this visit → plays the blur-in animation once. */
  fresh?: boolean;
  /** The answer mode that produced this reply (fast / thinking / coding / analyze). */
  mode?: ChatMode;
  /** The model's private reasoning (only when Settings → Show reasoning is on). */
  reasoning?: string;
  /** How long the "Thinking" state was visible before the first word arrived. */
  thoughtMs?: number;
  /** Memories the answer used (only when Memory is on) — shown as a small chip. */
  usedMemory?: { id: string; text: string }[];
  /** Attached file contents kept in memory so "Try again" can resend them. */
  outgoing?: { name: string; content: string }[];
  /** Pictures kept by id (the bytes stay on the server) so "Try again" can resend them. */
  outgoingImages?: { id: string }[];
};

export type ConversationState = {
  messages: UiMessage[];
  hasMore: boolean;
  nextBefore: string | null;
  status: "idle" | "loading" | "ready" | "error";
  loadingOlder: boolean;
};

export type ChatState = {
  sessions: SessionSummary[];
  nextCursor: string | null;
  conversations: Record<string, ConversationState>;
  activeKey: string;
  /** Conversation key with a reply in progress (one at a time). */
  streamingKey: string | null;
};

export const emptyConversation = (status: ConversationState["status"] = "ready"): ConversationState => ({
  messages: [],
  hasMore: false,
  nextBefore: null,
  status,
  loadingOlder: false,
});

export type ChatAction =
  | { type: "sessionsLoaded"; sessions: SessionSummary[]; nextCursor: string | null; append: boolean }
  | { type: "select"; key: string }
  | { type: "newChat" }
  | { type: "conversationLoading"; key: string }
  | { type: "conversationLoaded"; key: string; page: MessagesPage }
  | { type: "conversationFailed"; key: string }
  | { type: "olderLoading"; key: string }
  | { type: "olderLoaded"; key: string; page: MessagesPage | null }
  | { type: "sendStart"; key: string; user?: UiMessage; assistant: UiMessage; replaceId?: string }
  | {
      type: "meta";
      key: string;
      conversationId: string | null;
      title: string | null;
      userTempId?: string;
      userMessageId: string | null;
      retry?: boolean;
    }
  | { type: "phase"; key: string; id: string; phase: StreamPhase; message?: string }
  | { type: "append"; key: string; id: string; text: string }
  | { type: "reasoning"; key: string; id: string; text: string }
  | { type: "thought"; key: string; id: string; ms: number }
  | {
      type: "done";
      key: string;
      id: string;
      newId: string | null;
      latencyMs: number;
      text?: string;
      usedMemory?: { id: string; text: string }[];
    }
  | { type: "failed"; key: string; id: string; error: { code: string; message: string; retryable: boolean } }
  | { type: "stopped"; key: string; id: string }
  | { type: "renamed"; id: string; title: string }
  | { type: "deleted"; id: string }
  | { type: "clearedAll" };

function updateConversation(
  state: ChatState,
  key: string,
  update: (c: ConversationState) => ConversationState,
): ChatState {
  const current = state.conversations[key];
  if (!current) return state;
  return { ...state, conversations: { ...state.conversations, [key]: update(current) } };
}

function updateMessage(
  state: ChatState,
  key: string,
  id: string,
  update: (m: UiMessage) => UiMessage,
): ChatState {
  return updateConversation(state, key, (c) => ({
    ...c,
    messages: c.messages.map((m) => (m.id === id ? update(m) : m)),
  }));
}

/** Moves a session to the top of the sidebar with fresh time/count. */
function touchSession(sessions: SessionSummary[], id: string, addMessages: number): SessionSummary[] {
  const found = sessions.find((s) => s.id === id);
  if (!found) return sessions;
  const updated = {
    ...found,
    messageCount: found.messageCount + addMessages,
    updatedAt: new Date().toISOString(),
  };
  return [updated, ...sessions.filter((s) => s.id !== id)];
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "sessionsLoaded": {
      const sessions = action.append
        ? [...state.sessions, ...action.sessions.filter((s) => !state.sessions.some((x) => x.id === s.id))]
        : action.sessions;
      return { ...state, sessions, nextCursor: action.nextCursor };
    }

    case "select":
      return {
        ...state,
        activeKey: action.key,
        conversations: state.conversations[action.key]
          ? state.conversations
          : { ...state.conversations, [action.key]: emptyConversation("loading") },
      };

    case "newChat": {
      // Keep a draft that is still streaming; otherwise start clean.
      const keep = state.streamingKey === DRAFT && state.conversations[DRAFT];
      return {
        ...state,
        activeKey: DRAFT,
        conversations: {
          ...state.conversations,
          [DRAFT]: keep ? state.conversations[DRAFT] : emptyConversation(),
        },
      };
    }

    case "conversationLoading":
      return {
        ...state,
        conversations: { ...state.conversations, [action.key]: emptyConversation("loading") },
      };

    case "conversationLoaded":
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.key]: { ...emptyConversation(), ...action.page, status: "ready" },
        },
      };

    case "conversationFailed":
      return updateConversation(state, action.key, (c) => ({ ...c, status: "error" }));

    case "olderLoading":
      return updateConversation(state, action.key, (c) => ({ ...c, loadingOlder: true }));

    case "olderLoaded":
      return updateConversation(state, action.key, (c) =>
        action.page
          ? {
              ...c,
              loadingOlder: false,
              messages: [
                ...action.page.messages.filter((m) => !c.messages.some((x) => x.id === m.id)),
                ...c.messages,
              ],
              hasMore: action.page.hasMore,
              nextBefore: action.page.nextBefore,
            }
          : { ...c, loadingOlder: false },
      );

    case "sendStart": {
      const conv = state.conversations[action.key] ?? emptyConversation();
      const base = action.replaceId ? conv.messages.filter((m) => m.id !== action.replaceId) : conv.messages;
      const messages = [...base, ...(action.user ? [action.user] : []), action.assistant];
      return {
        ...state,
        streamingKey: action.key,
        conversations: { ...state.conversations, [action.key]: { ...conv, status: "ready", messages } },
      };
    }

    case "meta": {
      let next = state;
      const { conversationId } = action;
      // First message of a new chat: the draft becomes a real, saved session.
      if (conversationId && action.key !== conversationId) {
        const { [action.key]: moved, ...rest } = state.conversations;
        next = {
          ...state,
          conversations: { ...rest, [conversationId]: moved ?? emptyConversation() },
          activeKey: state.activeKey === action.key ? conversationId : state.activeKey,
          streamingKey: state.streamingKey === action.key ? conversationId : state.streamingKey,
        };
      }
      if (conversationId) {
        const exists = next.sessions.some((s) => s.id === conversationId);
        const now = new Date().toISOString();
        next = {
          ...next,
          sessions: exists
            ? touchSession(next.sessions, conversationId, action.retry ? 0 : 1).map((s) =>
                s.id === conversationId && action.title ? { ...s, title: action.title } : s,
              )
            : [
                {
                  id: conversationId,
                  title: action.title ?? "New Chat Session",
                  messageCount: 1,
                  createdAt: now,
                  updatedAt: now,
                },
                ...next.sessions,
              ],
        };
      }
      const key = conversationId ?? action.key;
      if (action.userTempId && action.userMessageId) {
        next = updateMessage(next, key, action.userTempId, (m) => ({ ...m, id: action.userMessageId! }));
      }
      return next;
    }

    case "phase":
      return updateMessage(state, action.key, action.id, (m) => ({
        ...m,
        phase: action.phase,
        statusMessage: action.message,
      }));

    case "append":
      return updateMessage(state, action.key, action.id, (m) => ({
        ...m,
        content: m.content + action.text,
        phase: "streaming",
        statusMessage: undefined,
      }));

    case "thought":
      return updateMessage(state, action.key, action.id, (m) =>
        m.thoughtMs === undefined ? { ...m, thoughtMs: action.ms } : m,
      );

    case "reasoning":
      return updateMessage(state, action.key, action.id, (m) => ({
        ...m,
        reasoning: (m.reasoning ?? "") + action.text,
      }));

    case "done": {
      const next = updateMessage(state, action.key, action.id, (m) => ({
        ...m,
        usedMemory: action.usedMemory?.length ? action.usedMemory : m.usedMemory,
        // The server removes trailing filler after streaming; swap in its final text.
        content: action.text ?? m.content,
        id: action.newId ?? m.id,
        status: undefined,
        phase: undefined,
        statusMessage: undefined,
        latencyMs: action.latencyMs,
      }));
      return { ...next, streamingKey: null, sessions: touchSession(next.sessions, action.key, 1) };
    }

    case "failed": {
      const next = updateMessage(state, action.key, action.id, (m) => ({
        ...m,
        status: "error",
        phase: undefined,
        statusMessage: undefined,
        error: action.error,
      }));
      return { ...next, streamingKey: null };
    }

    case "stopped": {
      const next = updateMessage(state, action.key, action.id, (m) => ({
        ...m,
        status: "stopped",
        phase: undefined,
        statusMessage: undefined,
      }));
      return { ...next, streamingKey: null };
    }

    case "renamed":
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, title: action.title } : s)),
      };

    case "deleted": {
      const { [action.id]: _removed, ...conversations } = state.conversations;
      void _removed;
      const wasActive = state.activeKey === action.id;
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.id),
        conversations: wasActive ? { ...conversations, [DRAFT]: emptyConversation() } : conversations,
        activeKey: wasActive ? DRAFT : state.activeKey,
      };
    }

    case "clearedAll":
      return {
        ...state,
        sessions: [],
        nextCursor: null,
        conversations: { [DRAFT]: emptyConversation() },
        activeKey: DRAFT,
        streamingKey: null,
      };
  }
}

export function initialChatState({
  sessions,
  nextCursor,
  activeId,
  activePage,
}: {
  sessions: SessionSummary[];
  nextCursor: string | null;
  activeId: string | null;
  activePage: MessagesPage | null;
}): ChatState {
  const conversations: Record<string, ConversationState> = { [DRAFT]: emptyConversation() };
  if (activeId && activePage) conversations[activeId] = { ...emptyConversation(), ...activePage };
  return {
    sessions,
    nextCursor,
    conversations,
    activeKey: activeId && activePage ? activeId : DRAFT,
    streamingKey: null,
  };
}
