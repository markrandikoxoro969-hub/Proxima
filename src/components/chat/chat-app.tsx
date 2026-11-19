"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api } from "@/lib/chat/client/api";
import { DRAFT } from "@/lib/chat/client/chat-state";
import { useChat } from "@/lib/chat/client/use-chat";
import type { EngineStatus, MessagesPage, Profile, SessionSummary } from "@/lib/chat/types";
import type { ThemePreference } from "@/lib/theme";
import { useMediaQuery } from "@/lib/use-media-query";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { Sidebar } from "./sidebar";

// Loaded only when needed (keeps the first load small and fast).
const SettingsDialog = dynamic(() => import("./settings-dialog").then((m) => m.SettingsDialog));
const Onboarding = dynamic(() => import("./onboarding").then((m) => m.Onboarding));
const Particles = dynamic(() => import("./particles"), { ssr: false });

export type ChatAppProps = {
  profile: Profile;
  initialSessions: SessionSummary[];
  initialNextCursor: string | null;
  initialActiveId: string | null;
  initialActivePage: MessagesPage | null;
};

export function ChatApp(props: ChatAppProps) {
  return (
    <MotionProvider>
      <ToastProvider>
        <ChatScreen {...props} />
      </ToastProvider>
    </MotionProvider>
  );
}

function ChatScreen({
  profile: initialProfile,
  initialSessions,
  initialNextCursor,
  initialActiveId,
  initialActivePage,
}: ChatAppProps) {
  const notify = useToast();
  const { preference, setPreference } = useTheme();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [profile, setProfile] = useState(initialProfile);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [engine, setEngine] = useState<EngineStatus>("checking");
  const [statusLatency, setStatusLatency] = useState<number | null>(null);
  const [pinSignal, setPinSignal] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [hasSent, setHasSent] = useState(false);

  const chat = useChat({ initialSessions, initialNextCursor, initialActiveId, initialActivePage, notify });
  const { state, active, newChat: startNewChat, send: sendMessage, select: selectChat } = chat;
  const shownName = profile.displayName ?? profile.name?.split(" ")[0] ?? "Explorer";

  // Use the theme saved in your account (so it follows you between devices).
  const appliedProfileTheme = useRef(false);
  useEffect(() => {
    if (appliedProfileTheme.current) return;
    appliedProfileTheme.current = true;
    if (profile.onboarded && profile.theme !== preference) setPreference(profile.theme);
  }, [profile.onboarded, profile.theme, preference, setPreference]);

  // Real engine status (+ wakes the Render server early so your first reply is faster).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const { ai } = await api.status();
        if (cancelled) return;
        setEngine(ai.status);
        if (ai.latencyMs != null) setStatusLatency(ai.latencyMs);
        if (ai.status !== "online" && tries < 12)
          timer = setTimeout(check, ai.status === "waking" ? 5000 : 15000);
      } catch {
        if (!cancelled) setEngine("offline");
      }
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // A finished reply proves the engine is online.
  const engineShown: EngineStatus = chat.lastLatency != null ? "online" : engine;

  // Screen-reader announcements for reply progress (the reply text itself isn't read char by char).
  const announcement = state.streamingKey ? "Proxima is replying…" : hasSent ? "Reply finished." : "";

  const newChat = useCallback(() => {
    startNewChat();
    setSidebarOpen(false);
    setFocusSignal((n) => n + 1);
  }, [startNewChat]);

  // Keyboard shortcuts: "/" focuses the input · Ctrl/Cmd+Shift+O starts a new chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setFocusSignal((n) => n + 1);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const send = useCallback(
    (text: string, attachments: { name: string; content: string }[] = []) => {
      setPinSignal((n) => n + 1);
      setHasSent(true);
      return sendMessage(text, attachments);
    },
    [sendMessage],
  );

  const select = useCallback(
    (id: string) => {
      selectChat(id);
      setSidebarOpen(false);
    },
    [selectChat],
  );

  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const saveTheme = useCallback((theme: ThemePreference) => {
    setProfile((p) => ({ ...p, theme }));
    api.updateProfile({ theme }).catch(() => {
      /* the theme still applies on this device */
    });
  }, []);

  const openSettings = useCallback(() => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
    setSidebarOpen(false);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const onOnboarded = useCallback(
    (saved: Profile) => {
      setProfile(saved);
      notify(`Welcome aboard, ${saved.displayName ?? "explorer"}!`, "success");
      setFocusSignal((n) => n + 1);
    },
    [notify],
  );

  const activeId = state.activeKey === DRAFT ? null : state.activeKey;
  const isEmpty = !active || (active.status === "ready" && active.messages.length === 0);

  return (
    <div className="relative isolate flex h-dvh overflow-hidden bg-bg">
      {profile.particles && <Particles />}

      {/* While onboarding is open, everything behind it is unreachable (keyboard + screen readers). */}
      <div className="flex min-w-0 flex-1" inert={!profile.onboarded || undefined}>
        <Sidebar
          sessions={state.sessions}
          activeKey={state.activeKey}
          streamingKey={state.streamingKey}
          hasMore={state.nextCursor !== null}
          engine={engineShown}
          profile={profile}
          open={sidebarOpen}
          isDesktop={isDesktop}
          onClose={closeSidebar}
          onNewChat={newChat}
          onSelect={select}
          onRename={chat.rename}
          onRequestDelete={setPendingDelete}
          onLoadMore={chat.loadMoreSessions}
          onOpenSettings={openSettings}
          onThemeChange={saveTheme}
        />

        <main
          id="main"
          className="flex min-w-0 flex-1 flex-col pr-safe"
          inert={(!isDesktop && sidebarOpen) || undefined}
        >
          <ChatHeader
            title={chat.activeSession?.title ?? null}
            activeId={activeId}
            latencyMs={chat.lastLatency ?? statusLatency}
            sidebarOpen={sidebarOpen}
            isDesktop={isDesktop}
            onOpenSidebar={openSidebar}
            onNewChat={newChat}
          />

          {active?.status === "loading" ? (
            <ConversationSkeleton />
          ) : active?.status === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="font-semibold">Couldn&apos;t load this chat.</p>
              <button
                type="button"
                onClick={() => void chat.reloadActive()}
                className="tap rounded-xl border border-line px-4 text-sm font-bold transition-colors duration-200 hover:bg-surface-hover"
              >
                Try again
              </button>
            </div>
          ) : isEmpty ? (
            <EmptyState name={shownName} onPick={(prompt) => void send(prompt)} disabled={chat.isStreaming} />
          ) : (
            <MessageList
              key={state.activeKey === DRAFT ? DRAFT : activeId}
              conversation={active}
              onRetry={chat.retry}
              onLoadOlder={chat.loadOlder}
              canRetry={!chat.isStreaming}
              pinSignal={pinSignal}
            />
          )}

          <Composer
            onSend={send}
            onStop={chat.stop}
            streaming={chat.isStreaming}
            notify={notify}
            focusSignal={focusSignal}
          />
        </main>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {settingsLoaded && (
        <SettingsDialog
          open={settingsOpen}
          profile={profile}
          onClose={() => setSettingsOpen(false)}
          onSaved={setProfile}
          onClearAll={chat.clearAll}
          notify={notify}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this chat?"
        message={
          pendingDelete ? `“${pendingDelete.title}” and all its messages will be permanently deleted.` : ""
        }
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          await chat.remove(pendingDelete.id);
          setDeleting(false);
          setPendingDelete(null);
        }}
      />

      {!profile.onboarded && <Onboarding profile={profile} onDone={onOnboarded} />}
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading chat">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-6">
            <div className="ml-auto h-12 w-2/3 animate-pulse rounded-3xl bg-surface-hover sm:w-1/2" />
            <div className="flex gap-3">
              <div className="size-9 animate-pulse rounded-xl bg-surface-hover" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-5/6 animate-pulse rounded bg-surface-hover" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-surface-hover" />
                <div className="h-4 w-3/6 animate-pulse rounded bg-surface-hover" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
