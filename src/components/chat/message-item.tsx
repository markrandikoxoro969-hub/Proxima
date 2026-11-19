"use client";

import { ArrowClockwise, Check, Copy, FileText, Planet, WarningCircle } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { memo } from "react";
import type { UiMessage } from "@/lib/chat/client/chat-state";
import { formatBytes } from "@/lib/chat/client/files";
import { cn } from "@/lib/cn";
import { useCopy } from "./use-copy";

// Markdown + its parser load the first time a reply is shown (not on page load).
const Markdown = dynamic(() => import("./markdown"), {
  loading: () => <div className="h-5 w-40 animate-pulse rounded-md bg-surface-hover" aria-hidden />,
});

export const MessageItem = memo(function MessageItem({
  message,
  onRetry,
  canRetry,
}: {
  message: UiMessage;
  onRetry: (id: string) => void;
  canRetry: boolean;
}) {
  return message.role === "user" ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage message={message} onRetry={onRetry} canRetry={canRetry} />
  );
});

function UserMessage({ message }: { message: UiMessage }) {
  return (
    <div className={cn("flex justify-end", message.fresh && "animate-msg-in")}>
      <div className="flex max-w-[88%] flex-col items-end gap-2 sm:max-w-[80%]">
        {message.attachments && message.attachments.length > 0 && (
          <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Attached files">
            {message.attachments.map((file) => (
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
        <div className="rounded-3xl rounded-br-lg bg-inverse px-5 py-3 text-[15px] leading-relaxed font-medium break-words whitespace-pre-wrap text-on-inverse shadow-glow">
          <span className="sr-only">You said: </span>
          {message.content}
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  onRetry,
  canRetry,
}: {
  message: UiMessage;
  onRetry: (id: string) => void;
  canRetry: boolean;
}) {
  const streaming = message.status === "streaming";
  const waiting = streaming && !message.content;
  const { copied, copy } = useCopy();

  return (
    <div className={cn("flex gap-3 sm:gap-4", message.fresh && "animate-msg-in")}>
      <div
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-hover sm:size-9"
      >
        <Planet weight="fill" className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-extrabold tracking-[0.25em] text-subtle uppercase">
          Proxima<span className="sr-only"> replied:</span>
        </p>

        {waiting ? (
          <Thinking phase={message.phase} message={message.statusMessage} />
        ) : (
          message.content && <Markdown content={message.content} streaming={streaming} />
        )}

        {streaming && message.content && <span className="stream-caret" aria-hidden />}

        {message.status === "error" && message.error && (
          <div
            role="alert"
            className="mt-3 flex flex-col gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-4 text-sm sm:flex-row sm:items-center"
          >
            <WarningCircle weight="fill" className="size-5 shrink-0 text-red-500" aria-hidden />
            <p className="flex-1 font-semibold">{message.error.message}</p>
            {message.error.retryable && (
              <RetryButton onClick={() => onRetry(message.id)} disabled={!canRetry} />
            )}
          </div>
        )}

        {message.status === "stopped" && (
          <div className="mt-3 flex items-center gap-3 text-xs font-bold text-subtle">
            <span>Stopped</span>
            <RetryButton onClick={() => onRetry(message.id)} disabled={!canRetry} label="Regenerate" />
          </div>
        )}

        {!message.status && message.content && (
          <div className="mt-2 flex items-center gap-1 text-subtle">
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
            {message.latencyMs != null && (
              <span className="font-mono text-[11px]" title="Time the engine took to answer">
                {(message.latencyMs / 1000).toFixed(message.latencyMs < 10_000 ? 2 : 1)}s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RetryButton({
  onClick,
  disabled,
  label = "Try again",
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-surface-hover px-4 text-xs font-extrabold text-fg transition-[background-color,opacity] duration-200 hover:bg-surface disabled:opacity-40"
    >
      <ArrowClockwise weight="bold" className="size-4" aria-hidden /> {label}
    </button>
  );
}

function Thinking({ phase, message }: { phase?: UiMessage["phase"]; message?: string }) {
  const waking = phase === "waking";
  return (
    <div className="flex flex-col gap-2 py-1" role="status">
      <div className="flex items-center gap-3">
        <span className="thinking-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="text-sm font-semibold text-muted">
          {waking ? "Waking up the engine…" : "Thinking…"}
        </span>
      </div>
      {waking && (
        <p className="max-w-md text-xs text-subtle">
          {message ?? "The PROXIMA engine was asleep. The first reply can take up to a minute."}
        </p>
      )}
    </div>
  );
}
