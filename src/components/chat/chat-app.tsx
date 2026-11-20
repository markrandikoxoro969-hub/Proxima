"use client";

import {
  ArrowDown,
  Brain,
  ChatCircleText,
  Copy,
  GearSix,
  Moon,
  Plus,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api } from "@/lib/chat/client/api";
import { DRAFT } from "@/lib/chat/client/chat-state";
import { useChat } from "@/lib/chat/client/use-chat";
import { useShowReasoning } from "@/lib/chat/client/use-show-reasoning";
import { EASE } from "@/lib/motion/tokens";
import type { EngineStatus, MessagesPage, Profile, SessionSummary } from "@/lib/chat/types";
import type { ThemePreference } from "@/lib/theme";
import { useMediaQuery } from "@/lib/use-media-query";
import { ChatHeader } from "./chat-header";
import { CommandPalette, type Command } from "./command-palette";
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
  const router = useRouter();
  const { preference, resolved, setPreference } = useTheme();
  const [showReasoning, setShowReasoning] = useShowReasoning();
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
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  // Keyboard shortcuts: ⌘K palette · "/" focus · ⌘⇧O new chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (e.key === "/" && !typing && !mod && !e.altKey) {
        e.preventDefault();
        setFocusSignal((n) => n + 1);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const copyLastReply = useCallback(() => {
    const messages = state.conversations[state.activeKey]?.messages ?? [];
    const last = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!last) return notify("No reply to copy yet.", "info");
    void navigator.clipboard.writeText(last.content).then(
      () => notify("Reply copied.", "success"),
      () => notify("Could not copy. Select the text instead.", "error"),
    );
  }, [notify, state.activeKey, state.conversations]);

  const openSettingsPage = useCallback(() => router.push("/settings"), [router]);

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

  const commands = useMemo<Command[]>(
    () => [
      { id: "new", label: "New chat", hint: "⌘⇧O", icon: <Plus weight="bold" className="size-4" />, run: newChat },
      {
        id: "focus",
        label: "Focus the message box",
        hint: "/",
        icon: <ChatCircleText weight="bold" className="size-4" />,
        run: () => setFocusSignal((n) => n + 1),
      },
      {
        id: "theme",
        label: `Switch to ${resolved === "dark" ? "light" : "dark"} theme`,
        icon: <Moon weight="bold" className="size-4" />,
        keywords: "theme dark light appearance",
        run: () => setPreference(resolved === "dark" ? "light" : "dark"),
      },
      {
        id: "reasoning",
        label: showReasoning ? "Hide the model's reasoning" : "Show the model's reasoning",
        icon: <Brain weight="bold" className="size-4" />,
        keywords: "thinking thoughts debug",
        run: () => setShowReasoning(!showReasoning),
      },
      {
        id: "copy",
        label: "Copy the last reply",
        icon: <Copy weight="bold" className="size-4" />,
        keywords: "clipboard",
        run: copyLastReply,
      },
      {
        id: "latest",
        label: "Jump to the latest message",
        icon: <ArrowDown weight="bold" className="size-4" />,
        run: () => setPinSignal((n) => n + 1),
      },
      {
        id: "settings",
        label: "Open settings",
        icon: <GearSix weight="bold" className="size-4" />,
        run: openSettings,
      },
      {
        id: "account",
        label: "All settings and your data",
        icon: <SlidersHorizontal weight="bold" className="size-4" />,
        keywords: "export delete account",
        run: openSettingsPage,
      },
    ],
    [copyLastReply, newChat, openSettings, openSettingsPage, resolved, setPreference, showReasoning, setShowReasoning],
  );

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

          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={`${state.activeKey}:${active?.status ?? "none"}:${isEmpty ? "empty" : "chat"}`}
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.22, ease: EASE }}
              className="flex min-h-0 flex-1 flex-col"
            >
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
            <EmptyState name={shownName} />
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
            </m.div>
          </AnimatePresence>

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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

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

/** Placeholder while a saved chat loads. A moving shimmer, not a spinner. */
function ConversationSkeleton() {
  const rows = [
    { user: 70, lines: [86, 64, 48] },
    { user: 54, lines: [78, 58] },
    { user: 64, lines: [82, 70, 40] },
  ];
  return (
    <div
      className="flex-1 overflow-hidden px-4 py-6 sm:px-6"
      aria-busy="true"
      aria-label="Loading chat"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-6">
            <div
              className="skeleton ml-auto h-11 rounded-3xl"
              style={{ width: `${row.user}%`, animationDelay: `${i * 90}ms` }}
            />
            <div className="flex gap-3">
              <div className="skeleton size-9 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2.5 pt-1">
                {row.lines.map((width, j) => (
                  <div
                    key={j}
                    className="skeleton h-3.5 rounded-full"
                    style={{ width: `${width}%`, animationDelay: `${i * 90 + j * 60}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
