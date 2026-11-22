"use client";

import {
  ArrowClockwise,
  Brain,
  CaretDown,
  Check,
  Copy,
  FileText,
  Lightbulb,
  ListChecks,
  Planet,
  SpeakerHigh,
  WarningCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useEffect, useState } from "react";
import { MODE_CONFIG } from "@/lib/ai/modes";
import type { UiMessage } from "@/lib/chat/client/chat-state";
import { hasUnclosedCodeFence } from "@/lib/chat/client/markdown-blocks";
import { formatBytes } from "@/lib/chat/client/files";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion/tokens";
import { api } from "@/lib/chat/client/api";
import { useCopy } from "./use-copy";

// Markdown + its parser load the first time a reply is shown (not on page load).
const Markdown = dynamic(() => import("./markdown"), {
  loading: () => <div className="h-5 w-40 animate-pulse rounded-md bg-surface-hover" aria-hidden />,
});

export const MessageItem = memo(function MessageItem({
  message,
  onRetry,
  canRetry,
  speaking,
  onRead,
  onQuickAction,
}: {
  message: UiMessage;
  onRetry: (id: string) => void;
  canRetry: boolean;
  /** This reply is being read aloud right now. */
  speaking?: boolean;
  onRead?: (id: string, text: string) => void;
  onQuickAction?: (instruction: string) => void;
}) {
  return message.role === "user" ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage
      message={message}
      onRetry={onRetry}
      canRetry={canRetry}
      speaking={speaking}
      onRead={onRead}
      onQuickAction={onQuickAction}
    />
  );
});

function UserMessage({ message }: { message: UiMessage }) {
  const attachments = message.attachments ?? [];
  const pictures = attachments.filter((file) => file.kind === "image" && file.url);
  const files = attachments.filter((file) => file.kind !== "image");

  return (
    <m.div
      className="flex justify-end"
      initial={message.fresh ? { opacity: 0, y: 8, filter: "blur(6px)" } : false}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="flex max-w-[88%] flex-col items-end gap-2 sm:max-w-[80%]">
        {pictures.length > 0 && (
          <ul className="flex flex-wrap justify-end gap-2" aria-label="Attached pictures">
            {pictures.map((picture) => (
              <li key={picture.imageId ?? picture.url}>
                <a
                  href={picture.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${picture.name ?? "picture"} in a new tab`}
                  className="block overflow-hidden rounded-2xl border border-line bg-surface-hover"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={picture.url}
                    alt={picture.name ?? "Attached picture"}
                    width={picture.width ?? 512}
                    height={picture.height ?? 512}
                    loading="lazy"
                    decoding="async"
                    className="max-h-56 w-auto max-w-[min(18rem,70vw)] object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Attached files">
            {files.map((file) => (
              <li
                key={file.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-hover px-3 py-1 text-xs font-semibold text-muted"
              >
                <FileText weight="bold" className="size-3.5" aria-hidden />
                <span className="max-w-40 truncate">{file.name}</span>
                <span className="text-subtle">· {formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="message-text rounded-3xl rounded-br-lg bg-inverse px-5 py-3 text-[15px] leading-relaxed font-medium break-words whitespace-pre-wrap text-on-inverse shadow-glow">
          <span className="sr-only">You said: </span>
          {message.content}
        </div>
      </div>
    </m.div>
  );
}

function AssistantMessage({
  message,
  onRetry,
  canRetry,
  speaking,
  onRead,
  onQuickAction,
}: {
  message: UiMessage;
  onRetry: (id: string) => void;
  canRetry: boolean;
  speaking?: boolean;
  onRead?: (id: string, text: string) => void;
  onQuickAction?: (instruction: string) => void;
}) {
  const streaming = message.status === "streaming";
  const waiting = streaming && !message.content;
  const { copied, copy } = useCopy();
  const done = !message.status && Boolean(message.content);
  // A reply that ends inside a fence was cut off. Offer the one action that
  // actually helps, instead of leaving half a file on screen.
  const cutOffCode = done && hasUnclosedCodeFence(message.content);

  return (
    <m.div
      className="flex gap-3 sm:gap-4"
      initial={message.fresh ? { opacity: 0, y: 8, filter: "blur(6px)" } : false}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <div
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-hover sm:size-9"
      >
        <Planet weight="fill" className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 flex min-w-0 items-center gap-2 text-[11px] font-extrabold tracking-[0.25em] text-subtle uppercase">
          <span className="shrink-0">Proxima</span>
          <span className="sr-only">{message.status === "error" ? " error:" : " replied:"}</span>
          {message.mode && message.mode !== "thinking" && message.status !== "error" && (
            // Nowrap + shrink-0: on a narrow phone a squeezed badge used to
            // wrap "Analyze" one letter per line.
            <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[9px] tracking-[0.18em] whitespace-nowrap text-muted">
              {MODE_CONFIG[message.mode].label}
            </span>
          )}
        </p>

        {waiting ? (
          <Thinking phase={message.phase} message={message.statusMessage} mode={message.mode} />
        ) : (
          <>
            {message.thoughtMs ? <ThoughtFor ms={message.thoughtMs} /> : null}
            {message.content && <Markdown content={message.content} streaming={streaming} />}
          </>
        )}

        {streaming && message.content && message.statusMessage && (
          <p role="status" className="mt-3 text-sm text-muted">
            {message.statusMessage}
          </p>
        )}
        {streaming && message.content && <span className="stream-caret" aria-hidden />}

        {cutOffCode && (
          <div
            role="status"
            className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm sm:flex-row sm:items-center"
          >
            <WarningCircle weight="fill" className="size-5 shrink-0 text-amber-500" aria-hidden />
            <p className="flex-1 font-semibold">This answer stopped in the middle of the code.</p>
            {onQuickAction && (
              <ActionButton
                onClick={() =>
                  onQuickAction(
                    "Your previous answer stopped in the middle of a code block. Continue exactly where it stopped, do not repeat any code already written, and finish the code block.",
                  )
                }
                disabled={!canRetry}
                label="Continue"
              />
            )}
          </div>
        )}

        {message.usedMemory?.length ? <MemoryUsed memories={message.usedMemory} /> : null}

        {message.reasoning && <ReasoningBlock text={message.reasoning} streaming={streaming} />}

        {message.status === "error" && message.error && (
          <div
            role="alert"
            className="mt-3 flex flex-col gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-4 text-sm sm:flex-row sm:items-center"
          >
            <WarningCircle weight="fill" className="size-5 shrink-0 text-red-500" aria-hidden />
            <p className="flex-1 font-semibold">{message.error.message}</p>
            {message.error.retryable && (
              <ActionButton onClick={() => onRetry(message.id)} disabled={!canRetry} label="Try again" />
            )}
          </div>
        )}

        {message.status === "stopped" && (
          <div className="mt-3 flex items-center gap-3 text-xs font-bold text-subtle">
            <span>Stopped</span>
            <ActionButton onClick={() => onRetry(message.id)} disabled={!canRetry} label="Regenerate" />
          </div>
        )}

        <AnimatePresence initial={false}>
          {done && (
            <m.div
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-1.5 flex flex-wrap items-center gap-0.5 text-subtle"
            >
              {onRead && (
                <button
                  type="button"
                  onClick={() => onRead(message.id, message.content)}
                  aria-label={speaking ? "Stop reading this reply" : "Read this reply aloud"}
                  title={speaking ? "Stop reading" : "Read aloud"}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-lg transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg pointer-fine:size-9",
                    speaking && "text-[var(--accent-text)]",
                  )}
                >
                  <SpeakerHigh
                    weight={speaking ? "fill" : "bold"}
                    className={cn("size-4", speaking && "animate-pulse")}
                    aria-hidden
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => copy(message.content)}
                aria-label={copied ? "Reply copied" : "Copy reply"}
                title="Copy reply"
                className="inline-flex size-11 items-center justify-center rounded-lg transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg pointer-fine:size-9"
              >
                {copied ? (
                  <Check weight="bold" className="size-4 text-emerald-500" aria-hidden />
                ) : (
                  <Copy weight="bold" className="size-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                disabled={!canRetry}
                aria-label="Regenerate reply"
                title="Regenerate"
                className="inline-flex size-11 items-center justify-center rounded-lg transition-[color,background-color,transform] duration-200 hover:bg-surface-hover hover:text-fg active:rotate-180 disabled:opacity-30 pointer-fine:size-9"
              >
                <ArrowClockwise weight="bold" className="size-4" aria-hidden />
              </button>
              {onQuickAction && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onQuickAction("Explain your last answer more simply, with a short example.")
                    }
                    aria-label="Explain this more simply"
                    title="Simplify"
                    className="inline-flex size-11 items-center justify-center rounded-lg transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg pointer-fine:size-9"
                  >
                    <Lightbulb weight="bold" className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAction("Turn your last answer into a short, practical checklist.")}
                    aria-label="Turn this answer into a checklist"
                    title="Make a checklist"
                    className="inline-flex size-11 items-center justify-center rounded-lg transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg pointer-fine:size-9"
                  >
                    <ListChecks weight="bold" className="size-4" aria-hidden />
                  </button>
                </>
              )}
              {message.latencyMs != null && (
                <span
                  className="hidden px-1 font-mono text-[11px] min-[360px]:inline"
                  title="Time the engine took to answer"
                >
                  {(message.latencyMs / 1000).toFixed(message.latencyMs < 10_000 ? 2 : 1)}s
                </span>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  );
}

/** Small provenance chip with a direct "Forget this" action for each note. */
function MemoryUsed({ memories }: { memories: { id: string; text: string }[] }) {
  const [forgotten, setForgotten] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const forget = async (id: string) => {
    setError(null);
    try {
      await api.forgetMemory(id);
      setForgotten((current) => [...current, id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't forget that note.");
    }
  };

  const visible = memories.filter((memory) => !forgotten.includes(memory.id));
  if (!visible.length) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Memory used in this reply">
      {visible.map((memory) => (
        <span
          key={memory.id}
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface-hover px-3 py-1.5 text-xs text-muted"
        >
          <Brain weight="bold" className="size-3.5 shrink-0 text-[var(--accent-text)]" aria-hidden />
          <span className="max-w-48 truncate">Memory used: {memory.text}</span>
          <button
            type="button"
            onClick={() => void forget(memory.id)}
            className="shrink-0 font-extrabold text-fg underline underline-offset-2 hover:text-[var(--accent-text)]"
            aria-label={`Forget this: ${memory.text}`}
          >
            Forget this
          </button>
        </span>
      ))}
      {error && (
        <span className="text-xs text-red-500" role="status">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * The wait before the first word, in the Arena style: a theme-tinted orb, the
 * word "Thinking" with a light sweeping through it, three softly pulsing dots
 * and a live seconds counter. Screen readers hear one calm sentence instead of
 * the decoration. Once the reply starts it collapses to "Thought for 4s".
 */
function Thinking({
  phase,
  message,
  mode,
}: {
  phase?: UiMessage["phase"];
  message?: string;
  mode?: UiMessage["mode"];
}) {
  const reduced = useReducedMotion();
  const waking = phase === "waking";
  const label = mode ? MODE_CONFIG[mode].waiting : "Thinking";
  const [seconds, setSeconds] = useState(0);

  // A live counter, so a slow cold start feels like progress instead of a hang.
  useEffect(() => {
    if (reduced) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((performance.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [reduced]);

  return (
    <div className="flex flex-col gap-2 py-1.5" role="status" aria-live="polite">
      <span className="sr-only">{waking ? "Waking up the engine" : `Proxima is ${label.toLowerCase()}`}</span>
      <div className="flex items-center gap-2.5" aria-hidden>
        <span className="thinking-orb" />
        <span className="thinking-label text-sm">{waking ? "Waking up" : label}</span>
        <span className="thinking-dots">
          <span />
          <span />
          <span />
        </span>
        {seconds > 0 && <span className="font-mono text-[11px] text-subtle tabular-nums">{seconds}s</span>}
      </div>
      {waking && (
        <p className="max-w-md text-xs text-subtle">
          {message ?? "The engine was asleep. The first reply can take up to a minute."}
        </p>
      )}
    </div>
  );
}

/** "Thought for 4s" — the collapsed version of the block above. */
function ThoughtFor({ ms }: { ms: number }) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return (
    <p className="thought-line" title="Time spent thinking before the first word">
      Thought for {seconds}s
    </p>
  );
}

/**
 * The model's private reasoning, collapsed. It only exists in the message when
 * the user turned on Settings → Show reasoning, and it is never saved.
 */
function ReasoningBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <details className="group/reasoning mt-3 rounded-2xl border border-line bg-surface-hover/50 px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-subtle select-none [&::-webkit-details-marker]:hidden">
        <CaretDown
          weight="bold"
          className="size-3.5 transition-transform duration-300 group-open/reasoning:rotate-180"
          aria-hidden
        />
        Reasoning
        {streaming && <span className="ml-1 text-[10px] font-medium opacity-70">in progress</span>}
      </summary>
      <p className="mt-2 max-h-64 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-subtle">
        {text}
      </p>
    </details>
  );
}

function ActionButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-surface-hover px-4 text-xs font-extrabold text-fg",
        "transition-[background-color,opacity] duration-200 hover:bg-surface disabled:opacity-40",
      )}
    >
      <ArrowClockwise weight="bold" className="size-4" aria-hidden /> {label}
    </button>
  );
}
