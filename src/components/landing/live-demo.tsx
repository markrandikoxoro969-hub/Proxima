"use client";

import { ArrowClockwise, ArrowUp, Planet, SpeakerHigh, Stop, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ComposerMemeStage, type ActiveComposerMeme } from "@/components/chat/composer-vibes";
import {
  COMPOSER_MEMES,
  detectComposerMeme,
  type ComposerMemeKind,
} from "@/lib/chat/client/composer-memes";
import { useComposerVibes } from "@/lib/chat/client/use-composer-vibes";
import { streamChat } from "@/lib/chat/client/stream-chat";
import { useVoiceOutput } from "@/lib/chat/client/use-voice-output";
import { cn } from "@/lib/cn";
import { LIMITS } from "@/lib/limits";

/**
 * The landing-page demo: a real conversation with Proxima, no account needed.
 *  - Nothing is saved (the server treats it as a guest: 500 characters,
 *    5 messages per minute). Refreshing the page starts fresh.
 *  - Replies stream in live. The markdown/code renderer is downloaded only
 *    when you first use the demo, so it never slows the page down.
 *  - Auto-scroll stays inside the demo box and only if you're at the bottom
 *    (the original scrolled the whole page smoothly on every chunk).
 */
type DemoMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "error" | "stopped";
  phase?: "thinking" | "waking";
  error?: { code: string; message: string; retryText?: string };
};

type MarkdownComponent = ComponentType<{ content: string; streaming?: boolean }>;

const MAX_MESSAGES = 20;
let nextId = 1;

/** UUID v4 that also works on http:// phone testing (crypto.randomUUID needs https). */
function uuid(): string {
  if (typeof crypto.randomUUID === "function" && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function LiveDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [Markdown, setMarkdown] = useState<MarkdownComponent | null>(null);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [vibes] = useComposerVibes();
  const [activeMeme, setActiveMeme] = useState<ActiveComposerMeme | null>(null);
  const memeTimerRef = useRef<number | null>(null);
  const memeIdRef = useRef(0);
  const lastTriggerRef = useRef("");

  const triggerMeme = useCallback((kind: ComposerMemeKind, customCaption?: string) => {
    const spec = COMPOSER_MEMES[kind];
    const id = ++memeIdRef.current;
    const caption =
      customCaption ?? spec.captions[id % spec.captions.length] ?? spec.captions[0]!;
    setActiveMeme({ id, kind, caption });
    if (memeTimerRef.current) window.clearTimeout(memeTimerRef.current);
    memeTimerRef.current = window.setTimeout(() => {
      setActiveMeme((current) => (current?.id === id ? null : current));
    }, spec.durationMs);
  }, []);

  const dismissMeme = useCallback(() => {
    if (memeTimerRef.current) window.clearTimeout(memeTimerRef.current);
    setActiveMeme(null);
  }, []);

  useEffect(() => {
    return () => {
      if (memeTimerRef.current) window.clearTimeout(memeTimerRef.current);
    };
  }, []);

  const handleInputChange = useCallback(
    (next: string) => {
      setInput(next);
      if (!next.trim()) {
        lastTriggerRef.current = "";
        return;
      }
      if (!vibes.memesEnabled) return;
      const match = detectComposerMeme(next);
      if (!match) {
        lastTriggerRef.current = "";
        return;
      }
      const sig = `${match.kind}:${match.matched}`;
      if (sig !== lastTriggerRef.current) {
        lastTriggerRef.current = sig;
        triggerMeme(match.kind, match.caption);
      }
    },
    [vibes.memesEnabled, triggerMeme],
  );
  const {
    supported: canRead,
    speaking,
    speak,
    stop: stopSpeaking,
  } = useVoiceOutput({
    onEnd: () => setSpeakingId(null),
    onError: () => setSpeakingId(null),
  });

  const sessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const messagesRef = useRef<DemoMessage[]>([]);
  const markdownRequested = useRef(false);

  const loadMarkdown = useCallback(() => {
    if (markdownRequested.current) return;
    markdownRequested.current = true;
    import("@/components/chat/markdown")
      .then((m) => setMarkdown(() => m.Markdown))
      .catch(() => (markdownRequested.current = false)); // plain text still works
  }, []);

  // Stop any reply if you leave the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Current turns, for the guest history sent with the next message.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep the newest text in view — only inside the box, and only if you haven't scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy || text.length > LIMITS.demoMessageMax) return;
      stopSpeaking();
      setSpeakingId(null);
      loadMarkdown();
      sessionRef.current ??= uuid();

      const userId = nextId++;
      const replyId = nextId++;
      setMessages((list) =>
        [
          ...list,
          { id: userId, role: "user" as const, content: text },
          {
            id: replyId,
            role: "assistant" as const,
            content: "",
            status: "streaming" as const,
            phase: "thinking" as const,
          },
        ].slice(-MAX_MESSAGES),
      );
      setInput("");
      setBusy(true);
      setAnnouncement("Proxima is replying…");
      stickRef.current = true;

      const patch = (fn: (m: DemoMessage) => Partial<DemoMessage>) =>
        setMessages((list) => list.map((m) => (m.id === replyId ? { ...m, ...fn(m) } : m)));

      const controller = new AbortController();
      abortRef.current = controller;
      let finished = "Reply finished.";
      await streamChat(
        {
          message: text,
          demoSessionId: sessionRef.current,
          // Guests have no server-side history: send the last few turns so the
          // demo keeps its thread (nothing is stored).
          history: messagesRef.current
            .filter((m) => m.content.trim())
            .slice(-20)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        {
          signal: controller.signal,
          onStatus: (s) => patch(() => ({ phase: s.state })),
          onText: (chunk) => patch((m) => ({ content: m.content + chunk, phase: undefined })),
          onDone: () => patch(() => ({ status: undefined, phase: undefined })),
          onError: (err) => {
            finished = err.message;
            patch(() => ({
              status: "error",
              phase: undefined,
              error: { code: err.code, message: err.message, retryText: err.retryable ? text : undefined },
            }));
          },
          onAbort: () => {
            finished = "Stopped.";
            patch(() => ({ status: "stopped", phase: undefined }));
          },
        },
      );
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      setAnnouncement(finished);
    },
    [busy, loadMarkdown, stopSpeaking],
  );

  const read = (id: number, text: string) => {
    if (speakingId === id && speaking) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    stopSpeaking();
    setSpeakingId(id);
    if (!speak(text, { voice: "girl", speed: 1, engine: "natural" })) setSpeakingId(null);
  };

  const retry = (message: DemoMessage) => {
    const text = message.error?.retryText;
    if (!text) return;
    // Remove the failed reply and the question before it, then ask again.
    setMessages((list) => {
      const i = list.findIndex((m) => m.id === message.id);
      return i > 0 ? [...list.slice(0, i - 1), ...list.slice(i + 1)] : list;
    });
    void send(text);
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    sessionRef.current = null; // Proxima forgets the demo conversation
    inputRef.current?.focus();
  };

  const tooLong = input.length > LIMITS.demoMessageMax;
  const replies = messages.filter((m) => m.role === "assistant" && !m.status).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="overflow-hidden rounded-[2rem] classy-card">
        {/* Window bar */}
        <div className="flex items-center justify-between gap-3 border-b border-line py-2 pr-2 pl-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative size-2 rounded-full bg-emerald-500" />
            </span>
            <p className="truncate text-sm font-extrabold">
              Proxima <span className="text-subtle">· live demo</span>
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={messages.length === 0}
            className="inline-flex tap items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted transition-[color,background-color,opacity] duration-300 hover:bg-surface-hover hover:text-fg disabled:opacity-0"
          >
            <ArrowClockwise weight="bold" className="size-4" aria-hidden />
            New demo
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          data-lenis-prevent
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="h-[min(30rem,62dvh)] overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
          aria-label="Demo conversation"
          role="region"
          tabIndex={0}
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl border border-line bg-surface-hover">
                <Planet weight="fill" className="size-7" aria-hidden />
              </span>
              <p className="mt-5 text-xl font-black tracking-tight">Ask one real question.</p>
              <p className="mt-1.5 max-w-xs text-sm text-muted">
                Same engine, five messages a minute, nothing saved.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-6">
              {messages.map((m) => (
                <li key={m.id} className="animate-msg-in">
                  {m.role === "user" ? (
                    <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-lg bg-inverse px-4 py-2.5 text-[15px] font-semibold break-words whitespace-pre-wrap text-on-inverse">
                      <span className="sr-only">You said: </span>
                      {m.content}
                    </p>
                  ) : (
                    <DemoReply
                      message={m}
                      Markdown={Markdown}
                      onRetry={() => retry(m)}
                      onRead={read}
                      speaking={speaking && speakingId === m.id}
                      canRead={canRead}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="relative border-t border-line p-3 sm:p-4"
        >
          <ComposerMemeStage active={activeMeme} onDismiss={dismissMeme} />
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-line bg-bg py-1.5 pr-1.5 pl-4 transition-[border-color,box-shadow] duration-300 focus-within:border-line-strong",
              activeMeme?.kind === "wasted" && "composer-wasted-ring",
              activeMeme?.kind === "skull" && "composer-skull-ring",
            )}
          >
            <label htmlFor="demo-input" className="sr-only">
              Message Proxima (demo)
            </label>
            <input
              ref={inputRef}
              id="demo-input"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={loadMarkdown}
              placeholder="Message Proxima… (try typing bruh or wasted)"
              autoComplete="off"
              enterKeyHint="send"
              aria-invalid={tooLong || undefined}
              aria-describedby="demo-hint"
              className="min-w-0 flex-1 bg-transparent py-2 text-base font-medium outline-none placeholder:text-subtle"
            />
            {input.length > LIMITS.demoMessageMax - 100 && (
              <span
                className={cn("font-mono text-[11px] tabular-nums", tooLong ? "text-red-500" : "text-subtle")}
                aria-live="polite"
              >
                {input.length}/{LIMITS.demoMessageMax}
              </span>
            )}
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop reply"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-inverse text-on-inverse transition-transform duration-300 ease-premium active:scale-95"
              >
                <Stop weight="fill" className="size-4" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || tooLong}
                aria-label="Send message"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-inverse text-on-inverse transition-[transform,opacity] duration-300 ease-premium active:scale-95 disabled:opacity-30"
              >
                <ArrowUp weight="bold" className="size-5" aria-hidden />
              </button>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-1 text-[11px] font-semibold text-subtle">
            <p id="demo-hint" className="text-center">
              Demo · replies aren’t saved · {LIMITS.demoMessageMax} characters · 5 messages per minute
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => triggerMeme("skull")}
                className="rounded-full border border-line bg-surface-hover/70 px-2 py-0.5 text-[10px] font-extrabold text-muted transition-colors hover:border-red-400/50 hover:text-fg"
              >
                Pop Skull
              </button>
              <button
                type="button"
                onClick={() => triggerMeme("wasted")}
                className="rounded-full border border-line bg-surface-hover/70 px-2 py-0.5 text-[10px] font-extrabold text-muted transition-colors hover:border-red-400/50 hover:text-fg"
              >
                Pop Wasted
              </button>
            </div>
          </div>
        </form>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {replies >= 2 && (
        <div className="mt-5 flex animate-fade-up flex-col items-center justify-between gap-3 rounded-3xl border border-line px-5 py-4 text-center sm:flex-row sm:text-left">
          <p className="text-sm font-semibold text-muted">
            Enjoying it? Sign in to <span className="text-fg">save chats</span>, attach files and use voice.
          </p>
          <Link
            href="/login?callbackUrl=%2Fapp"
            className="inline-flex tap shrink-0 items-center rounded-xl bg-inverse px-4 text-sm font-extrabold text-on-inverse transition-transform duration-300 ease-premium active:scale-95"
          >
            Sign in with Google
          </Link>
        </div>
      )}
    </div>
  );
}

function DemoReply({
  message: m,
  Markdown,
  onRetry,
  onRead,
  speaking,
  canRead,
}: {
  message: DemoMessage;
  Markdown: MarkdownComponent | null;
  onRetry: () => void;
  onRead: (id: number, text: string) => void;
  speaking: boolean;
  canRead: boolean;
}) {
  const streaming = m.status === "streaming";
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-hover">
        <Planet weight="fill" className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">Proxima replied: </span>
        {m.content ? (
          Markdown ? (
            <Markdown content={m.content} streaming={streaming} />
          ) : (
            <p className="text-[15px] leading-7 break-words whitespace-pre-wrap">{m.content}</p>
          )
        ) : streaming ? (
          <p className="flex items-center gap-3 pt-1.5 text-sm font-semibold text-muted">
            <span className="thinking-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {m.phase === "waking"
              ? "Waking up the engine… the first reply can take up to a minute."
              : "Thinking…"}
          </p>
        ) : null}

        {m.content && !streaming && !m.status && canRead && (
          <button
            type="button"
            onClick={() => onRead(m.id, m.content)}
            aria-label={speaking ? "Stop reading this reply" : "Read this reply aloud"}
            aria-pressed={speaking}
            className={cn(
              "mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-fg",
              speaking && "text-[var(--accent-text)]",
            )}
          >
            <SpeakerHigh
              weight={speaking ? "fill" : "bold"}
              className={cn("size-3.5", speaking && "animate-pulse")}
              aria-hidden
            />
            {speaking ? "Stop" : "Hear this"}
          </button>
        )}

        {m.status === "stopped" && <p className="mt-2 text-xs font-semibold text-subtle">Stopped.</p>}

        {m.status === "error" && m.error && (
          <div role="alert" className="mt-1 flex flex-col items-start gap-3">
            <p className="flex items-start gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
              <WarningCircle weight="bold" className="mt-0.5 size-4 shrink-0" aria-hidden />
              {m.error.message}
            </p>
            <div className="flex flex-wrap gap-2">
              {m.error.retryText && m.error.code !== "rate_limited" && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex tap items-center gap-2 rounded-xl border border-line px-4 text-sm font-bold transition-colors duration-300 hover:bg-surface-hover"
                >
                  <ArrowClockwise weight="bold" className="size-4" aria-hidden />
                  Try again
                </button>
              )}
              {(m.error.code === "rate_limited" || m.error.code === "validation_error") && (
                <Link
                  href="/login?callbackUrl=%2Fapp"
                  className="inline-flex tap items-center rounded-xl bg-inverse px-4 text-sm font-extrabold text-on-inverse"
                >
                  Sign in for more
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
