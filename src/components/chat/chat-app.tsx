"use client";

import {
  ArrowDown,
  Brain,
  ChartBar,
  ChatCircleText,
  Code,
  Copy,
  GearSix,
  ImageSquare,
  Lightning,
  Moon,
  Plus,
  SlidersHorizontal,
  SpeakerHigh,
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
import { draftFromImage, type DraftImage } from "@/lib/chat/client/images";
import { useChat } from "@/lib/chat/client/use-chat";
import { useChatMode } from "@/lib/chat/client/use-mode";
import { useShowReasoning } from "@/lib/chat/client/use-show-reasoning";
import { useVoiceMode } from "@/lib/chat/client/use-voice-mode";
import { useVoiceOutput } from "@/lib/chat/client/use-voice-output";
import type { VoiceChoice } from "@/lib/chat/client/voice";
import { EASE } from "@/lib/motion/tokens";
import type { EngineStatus, MessagesPage, Profile, SessionSummary } from "@/lib/chat/types";
import type { ImageDTO } from "@/lib/image/types";
import type { ThemePreference } from "@/lib/theme";
import { useMediaQuery } from "@/lib/use-media-query";
import { ChatHeader } from "./chat-header";
import type { Command } from "./command-palette";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { Sidebar } from "./sidebar";
import { VoiceMenu } from "./voice-menu";

// Loaded only when needed (keeps the first load small and fast).
const SettingsDialog = dynamic(() => import("./settings-dialog").then((m) => m.SettingsDialog));
const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette));
const ImageStudio = dynamic(() => import("@/components/image/image-studio").then((m) => m.ImageStudio));
const Onboarding = dynamic(() => import("./onboarding").then((m) => m.Onboarding));
const Particles = dynamic(() => import("./particles"), { ssr: false });

const VOICE_SAMPLE = "Hi, I'm Proxima. This is how I'll read your answers aloud.";

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
  const { theme, paletteId, syncFromAccount, setPreference, resolved } = useTheme();
  const [showReasoning, setShowReasoning] = useShowReasoning();
  const [mode, setMode] = useChatMode();
  const [voice, setVoice] = useVoiceMode();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  // Separate from `isDesktop` (which renders as true on the server for layout):
  // this one starts false, so a phone never even downloads the canvas chunk.
  const canShowParticles = useMediaQuery("(min-width: 1024px)", false);
  const [profile, setProfile] = useState(initialProfile);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [engine, setEngine] = useState<EngineStatus>("checking");
  const [pinSignal, setPinSignal] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [hasSent, setHasSent] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [images, setImages] = useState<DraftImage[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listenSignal, setListenSignal] = useState(0);

  const chat = useChat({
    initialSessions,
    initialNextCursor,
    initialActiveId,
    initialActivePage,
    notify,
    mode,
  });
  const { state, active, newChat: startNewChat, send: sendMessage, select: selectChat } = chat;
  const shownName = profile.displayName ?? profile.name?.split(" ")[0] ?? "Explorer";

  // Voice mode: speak finished replies, optionally open the mic for the next one.
  const {
    supported: voiceSupported,
    speaking: voiceSpeaking,
    speak: speakAloud,
    stop: stopSpeech,
  } = useVoiceOutput({
    onEnd: () => {
      setSpeakingId(null);
      if (voice.enabled && voice.handsFree && voiceSupported) setListenSignal((n) => n + 1);
    },
    onError: (message) => {
      setSpeakingId(null);
      notify(message, "error");
    },
  });

  const stopVoice = useCallback(() => {
    stopSpeech();
    setSpeakingId(null);
  }, [stopSpeech]);

  // The newest finished reply. Streaming, stopped and failed replies are never read.
  const lastDone = useMemo(() => {
    const messages = state.conversations[state.activeKey]?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === "assistant" && !message.status && message.content.trim()) return message;
    }
    return null;
  }, [state.activeKey, state.conversations]);

  const speakReply = useCallback(
    (id: string, text: string) => {
      setSpeakingId(id);
      if (!speakAloud(text, { voice: voice.voice, speed: voice.speed })) setSpeakingId(null);
    },
    [speakAloud, voice.voice, voice.speed],
  );

  // Speak each reply exactly once when it changes from "streaming" to "done".
  // Opening an old chat never replays its history: the first render of a chat
  // only records a baseline. The state update lives in speakReply so React's
  // effect lint stays honest about this being an external sound action.
  const spokenMarker = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    const key = state.activeKey;
    if (!lastDone) {
      if (!spokenMarker.current || spokenMarker.current.key !== key) {
        spokenMarker.current = { key, id: "" };
      }
      return;
    }
    const previous = spokenMarker.current;
    if (!previous || previous.key !== key) {
      spokenMarker.current = { key, id: lastDone.id };
      return;
    }
    if (previous.id === lastDone.id) return;
    spokenMarker.current = { key, id: lastDone.id };
    // Only replies created in this visit (`fresh`) are read. A saved chat's
    // history can arrive after the first render; it must never be spoken.
    if (!voice.enabled || !voiceSupported || !lastDone.fresh) return;
    // Let the finished reply paint before the voice starts; the timer also
    // keeps this a true external effect rather than a render cascade.
    const timer = window.setTimeout(() => speakReply(lastDone.id, lastDone.content), 120);
    return () => window.clearTimeout(timer);
  }, [lastDone, state.activeKey, voice.enabled, voiceSupported, speakReply]);

  const readMessage = useCallback(
    (id: string, text: string) => {
      if (speakingId === id && voiceSpeaking) {
        stopVoice();
        return;
      }
      stopVoice();
      speakReply(id, text);
    },
    [speakingId, voiceSpeaking, stopVoice, speakReply],
  );

  const sampleVoice = useCallback(
    (choice: VoiceChoice, speed: number) => {
      stopVoice();
      // A preview is not a reply: it must not trigger hands-free listening.
      speakAloud(VOICE_SAMPLE, { voice: choice, speed, onDone: () => {} });
    },
    [speakAloud, stopVoice],
  );

  // Use the theme saved in your account (mode + palette + your own themes).
  const appliedProfileTheme = useRef(false);
  useEffect(() => {
    if (appliedProfileTheme.current || !profile.onboarded) return;
    appliedProfileTheme.current = true;
    syncFromAccount({
      preference: profile.theme,
      paletteId: profile.themePalette,
      customThemes: profile.customThemes,
    });
  }, [profile.onboarded, profile.theme, profile.themePalette, profile.customThemes, syncFromAccount]);

  // Picking a theme anywhere in the chat saves it to the account (one call per change).
  const savedPalette = useRef<string | null>(null);
  useEffect(() => {
    if (!profile.onboarded || savedPalette.current === paletteId) return;
    savedPalette.current = paletteId;
    if (profile.themePalette === paletteId) return;
    api.updateProfile({ themePalette: paletteId, theme: theme.mode }).catch(() => {
      /* the theme still applies on this device */
    });
  }, [paletteId, profile.onboarded, profile.themePalette, theme.mode]);

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
    stopVoice();
    startNewChat();
    setSidebarOpen(false);
    setImages([]);
    setFocusSignal((n) => n + 1);
  }, [startNewChat, stopVoice]);

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
    (
      text: string,
      attachments: { name: string; content: string }[] = [],
      sendableImages: { id: string; url: string; width: number; height: number; name: string }[] = [],
    ) => {
      stopVoice();
      setPinSignal((n) => n + 1);
      setHasSent(true);
      return sendMessage(text, attachments, sendableImages);
    },
    [sendMessage, stopVoice],
  );

  const quickAction = useCallback(
    (instruction: string) => {
      void send(instruction);
    },
    [send],
  );

  const openStudio = useCallback(() => {
    setSettingsOpen(false);
    setSidebarOpen(false);
    setStudioOpen(true);
  }, []);

  const useImageInChat = useCallback(
    (image: ImageDTO) => {
      setImages((current) => [...current.slice(0, 3), draftFromImage(image)]);
      setFocusSignal((n) => n + 1);
      notify("Picture attached — ask Proxima anything about it.", "info");
    },
    [notify],
  );

  const select = useCallback(
    (id: string) => {
      stopVoice();
      selectChat(id);
      setSidebarOpen(false);
    },
    [selectChat, stopVoice],
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
      {
        id: "new",
        label: "New chat",
        hint: "⌘⇧O",
        icon: <Plus weight="bold" className="size-4" />,
        run: newChat,
      },
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
      ...(
        [
          { id: "thinking", label: "Thinking", icon: <Brain weight="bold" className="size-4" /> },
          { id: "fast", label: "Fast", icon: <Lightning weight="bold" className="size-4" /> },
          { id: "coding", label: "Coding", icon: <Code weight="bold" className="size-4" /> },
          { id: "analyze", label: "Analyze", icon: <ChartBar weight="bold" className="size-4" /> },
        ] as const
      ).map((entry) => ({
        id: `mode-${entry.id}`,
        label: `Answer mode: ${entry.label}`,
        hint: mode === entry.id ? "On" : undefined,
        icon: entry.icon,
        keywords: "mode fast thinking coding analyze answer style",
        run: () => setMode(entry.id),
      })),
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
        id: "voice",
        label: voice.enabled ? "Turn off voice mode" : "Turn on voice mode",
        hint: voice.enabled ? (voice.voice === "girl" ? "Girl voice" : "Boy voice") : undefined,
        icon: <SpeakerHigh weight={voice.enabled ? "fill" : "bold"} className="size-4" />,
        keywords: "speak read aloud voice girl boy hands free listen",
        run: () => {
          setVoice(voice.enabled ? { enabled: false, handsFree: false } : { enabled: true });
          if (voice.enabled) stopVoice();
        },
      },
      {
        id: "latest",
        label: "Jump to the latest message",
        icon: <ArrowDown weight="bold" className="size-4" />,
        run: () => setPinSignal((n) => n + 1),
      },
      {
        id: "image",
        label: "Create or edit a picture",
        icon: <ImageSquare weight="bold" className="size-4" />,
        keywords: "image picture art generate draw edit photo studio",
        run: openStudio,
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
    [
      copyLastReply,
      newChat,
      openSettings,
      openSettingsPage,
      openStudio,
      resolved,
      setPreference,
      mode,
      setMode,
      showReasoning,
      setShowReasoning,
      voice.enabled,
      voice.voice,
      setVoice,
      stopVoice,
    ],
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
    <div className="app-shell relative isolate flex h-dvh overflow-hidden bg-bg">
      {/* Ambient canvas is desktop-only: on a phone it is a constant repaint for
          an effect you cannot see behind the chat. */}
      {profile.particles && canShowParticles && <Particles />}

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
          className="flex min-w-0 flex-1 flex-col pr-safe pl-safe"
          inert={(!isDesktop && sidebarOpen) || undefined}
        >
          <ChatHeader
            title={chat.activeSession?.title ?? null}
            activeId={activeId}
            sidebarOpen={sidebarOpen}
            isDesktop={isDesktop}
            onOpenSidebar={openSidebar}
            onNewChat={newChat}
            voiceMenu={
              <VoiceMenu
                supported={voiceSupported}
                settings={voice}
                speaking={voiceSpeaking}
                onChange={setVoice}
                onStop={stopVoice}
                onSample={sampleVoice}
              />
            }
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
                  speakingId={speakingId}
                  onRead={readMessage}
                  onQuickAction={quickAction}
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
            images={images}
            setImages={setImages}
            onOpenStudio={openStudio}
            onTemporaryChange={newChat}
            mode={mode}
            onModeChange={setMode}
            voice={{
              enabled: voice.enabled,
              handsFree: voice.handsFree,
              label: voice.voice === "girl" ? "Girl voice" : "Boy voice",
              speaking: voiceSpeaking,
              listenSignal,
              onStopSpeaking: stopVoice,
            }}
          />
        </main>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      {studioOpen && (
        <ImageStudio
          open={studioOpen}
          onClose={() => setStudioOpen(false)}
          notify={notify}
          onUseInChat={useImageInChat}
        />
      )}

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
          if (pendingDelete.id === activeId) stopVoice();
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
    <div className="flex-1 overflow-hidden px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading chat">
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
