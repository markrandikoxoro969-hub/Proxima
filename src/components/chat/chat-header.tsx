"use client";

import { DownloadSimple, List, NotePencil } from "@phosphor-icons/react";
import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { exportUrl } from "@/lib/chat/client/api";
import { cn } from "@/lib/cn";
import { ThemeAudioToggle } from "@/components/theme/theme-audio-toggle";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { site } from "@/lib/site";

export const ChatHeader = memo(function ChatHeader({
  title,
  activeId,
  sidebarOpen,
  isDesktop,
  desktopCollapsed = false,
  onToggleDesktopSidebar,
  onOpenPalette,
  onOpenSidebar,
  onNewChat,
  voiceInput,
  voiceMenu,
}: {
  title: string | null;
  activeId: string | null;
  sidebarOpen: boolean;
  isDesktop: boolean;
  desktopCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
  onOpenPalette?: () => void;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  /** Speech-input trigger, rendered beside the voice-mode trigger. */
  voiceInput?: ReactNode;
  /** Voice-mode trigger, rendered at the right edge of the toolbar. */
  voiceMenu?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-1 border-b border-line px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:gap-2 sm:px-5">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open chat sessions"
        aria-controls="sidebar"
        aria-expanded={isDesktop ? undefined : sidebarOpen}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg sm:size-11 lg:hidden"
      >
        <List weight="bold" className="size-5" aria-hidden />
      </button>

      {desktopCollapsed && onToggleDesktopSidebar && (
        <button
          type="button"
          onClick={onToggleDesktopSidebar}
          aria-label="Expand sidebar"
          title="Expand sidebar (⌘B)"
          className="hidden size-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg lg:inline-flex"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
      )}

      <div className="min-w-0 flex-1 px-1">
        <h1 className="flex items-center gap-1.5 text-base font-black tracking-tight sm:gap-2 sm:text-lg">
          {site.shortName} {/* ✦ drawn as SVG: not every phone font has the symbol. */}
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="hidden size-3 align-[0.1em] min-[400px]:inline-block"
            fill="currentColor"
          >
            <path d="M8 0c.5 4.2 3.8 7.5 8 8-4.2.5-7.5 3.8-8 8-.5-4.2-3.8-7.5-8-8 4.2-.5 7.5-3.8 8-8Z" />
          </svg>
          {title && (
            <span className="hidden min-w-0 truncate text-sm font-semibold text-muted md:inline">
              · {title}
            </span>
          )}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={onNewChat}
          aria-label="New chat"
          className="hidden size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg min-[400px]:inline-flex sm:size-11 lg:hidden"
        >
          <NotePencil weight="bold" className="size-5" aria-hidden />
        </button>
        {onOpenPalette && (
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="Open command palette"
            title="Quick search & commands (⌘K)"
            className="hidden h-11 shrink-0 items-center gap-2 rounded-xl glass-pill px-3 text-xs font-extrabold tracking-[0.14em] text-muted uppercase transition-colors duration-200 hover:border-[var(--glass-border-strong)] hover:bg-surface-hover hover:text-fg md:inline-flex"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="hidden xl:inline">Search</span>
            <kbd className="rounded-md border border-line bg-surface-solid px-1.5 py-0.5 font-mono text-[10px] font-bold text-subtle">
              ⌘K
            </kbd>
          </button>
        )}
        <ThemeAudioToggle />
        <ThemeMenu />
        {/* Export yields its place to the two voice controls on narrower phones. */}
        <div className="hidden min-[480px]:block">
          <ExportMenu activeId={activeId} />
        </div>
        {voiceInput}
        {voiceMenu}
      </div>
    </header>
  );
});

/** Export menu: download this chat or all chats as Markdown or JSON. */
function ExportMenu({ activeId }: { activeId: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    ...(activeId
      ? [
          { label: "This chat · Markdown", href: exportUrl(activeId, "md") },
          { label: "This chat · JSON", href: exportUrl(activeId, "json") },
        ]
      : []),
    { label: "All chats · Markdown", href: exportUrl(null, "md") },
    { label: "All chats · JSON", href: exportUrl(null, "json") },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="inline-flex tap items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold tracking-[0.15em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
      >
        <DownloadSimple weight="bold" className="size-5" aria-hidden />
        <span className="hidden sm:inline">Export</span>
        <span className="sr-only sm:hidden">Export chats</span>
      </button>
      <div
        id={menuId}
        role="menu"
        aria-label="Export"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          const all = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
          const index = all.indexOf(document.activeElement as HTMLElement);
          all[(index + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
        }}
        className={cn(
          "absolute top-full right-0 z-30 mt-2 w-60 rounded-2xl glass-dropdown p-1.5",
          open && "animate-scale-in",
        )}
      >
        {items.map((item) => (
          <a
            key={item.href}
            role="menuitem"
            href={item.href}
            download
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
