"use client";

import { ArrowDown } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ConversationState } from "@/lib/chat/client/chat-state";
import { cn } from "@/lib/cn";
import { MessageItem } from "./message-item";

const BOTTOM_THRESHOLD = 96; // px from the bottom that still counts as "at the bottom"
const LOAD_OLDER_AT = 400; // px from the top that loads older messages

/**
 * The scrolling conversation.
 *
 * Virtualized: only messages on (or near) the screen are in the page, so a
 * chat with 2,000 messages scrolls as smoothly as one with 5.
 *
 * Auto-scroll: follows new text ONLY while you're at the bottom. Scroll up
 * to read and it stays put; a "Jump to latest" button appears. Scrolling is
 * instant and at most once per frame (the original started a smooth-scroll
 * animation for every streamed chunk, which stuttered).
 */
export function MessageList({
  conversation,
  onRetry,
  onLoadOlder,
  canRetry,
  pinSignal,
}: {
  conversation: ConversationState;
  onRetry: (id: string) => void;
  onLoadOlder: () => void;
  canRetry: boolean;
  /** Changes when the user sends a message → jump to the bottom. */
  pinSignal: number;
}) {
  const { messages } = conversation;
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // TanStack Virtual manages its own memoization (expected warning with React Compiler rules).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (messages[i]?.role === "user" ? 72 : 160),
    getItemKey: (i) => messages[i]?.clientKey ?? messages[i]?.id ?? i,
    overscan: 6,
    paddingStart: 24,
    paddingEnd: 32,
  });

  const totalSize = virtualizer.getTotalSize();
  const last = messages.at(-1);
  const lastLength = last?.content.length ?? 0;

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Follow the conversation while pinned to the bottom.
  useLayoutEffect(() => {
    if (atBottom.current) scrollToBottom();
  }, [totalSize, lastLength, messages.length, scrollToBottom]);

  // Sending a message always brings you to the bottom.
  useLayoutEffect(() => {
    if (pinSignal === 0) return;
    atBottom.current = true;
    scrollToBottom();
  }, [pinSignal, scrollToBottom]);

  // Older messages were added at the top: keep what you're reading in place.
  const firstKey = messages[0]?.clientKey ?? messages[0]?.id;
  const previous = useRef<{ firstKey?: string; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = previous.current;
    if (prev.firstKey && firstKey !== prev.firstKey && !atBottom.current) {
      el.scrollTop += el.scrollHeight - prev.height;
    }
    previous.current = { firstKey, height: el.scrollHeight };
  });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const pinned = distance < BOTTOM_THRESHOLD;
    atBottom.current = pinned;
    setShowJump((shown) => (shown === !pinned ? shown : !pinned));
    if (el.scrollTop < LOAD_OLDER_AT && conversation.hasMore && !conversation.loadingOlder) onLoadOlder();
  }, [conversation.hasMore, conversation.loadingOlder, onLoadOlder]);

  // If the first page doesn't fill the screen, load older ones straight away.
  useEffect(() => {
    const el = scrollRef.current;
    if (
      el &&
      conversation.hasMore &&
      !conversation.loadingOlder &&
      el.scrollHeight <= el.clientHeight + LOAD_OLDER_AT
    ) {
      onLoadOlder();
    }
  }, [conversation.hasMore, conversation.loadingOlder, onLoadOlder, totalSize]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain [overflow-anchor:none]"
        aria-label="Conversation"
        role="region"
        tabIndex={0}
      >
        <div className="relative w-full" style={{ height: totalSize }}>
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            if (!message) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full px-4 pb-6 sm:px-6"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div className="mx-auto w-full max-w-3xl">
                  <MessageItem message={message} onRetry={onRetry} canRetry={canRetry} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {conversation.loadingOlder && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center" role="status">
          <span className="rounded-full glass-solid px-3 py-1 text-xs font-bold text-muted">
            Loading older messages…
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          atBottom.current = true;
          scrollToBottom();
          setShowJump(false);
        }}
        aria-label="Jump to latest message"
        tabIndex={showJump ? 0 : -1}
        className={cn(
          "absolute bottom-4 left-1/2 inline-flex h-10 -translate-x-1/2 items-center gap-2 rounded-full glass-solid px-4 text-xs font-bold",
          "transition-[opacity,transform] duration-300 ease-premium",
          showJump ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <ArrowDown weight="bold" className="size-4" aria-hidden /> Latest
      </button>
    </div>
  );
}
