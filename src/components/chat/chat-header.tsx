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
  onOpenSidebar,
  onNewChat,
  voiceInput,
  voiceMenu,
}: {
  title: string | null;
  activeId: string | null;
  sidebarOpen: boolean;
  isDesktop: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  /** Speech-input trigger, rendered beside the voice-mode trigger. */
  voiceInput?: ReactNode;
  /** Voice-mode trigger, rendered at the right edge of the toolbar. */
  voiceMenu?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-1.5 border-b border-line px-2.5 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5 sm:gap-2 sm:px-4">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open chat sessions"
        aria-controls="sidebar"
        aria-expanded={isDesktop ? undefined : sidebarOpen}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg sm:size-8 lg:hidden"
      >
        <List weight="bold" className="size-[18px]" aria-hidden />
      </button>

      <div className="min-w-0 flex-1 px-0.5">
        <h1 className="flex items-center gap-1.5 text-sm font-black tracking-tight sm:text-[15px]">
          {site.shortName} {/* ✦ drawn as SVG: not every phone font has the symbol. */}
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="hidden size-2.5 align-[0.1em] min-[400px]:inline-block"
            fill="currentColor"
          >
            <path d="M8 0c.5 4.2 3.8 7.5 8 8-4.2.5-7.5 3.8-8 8-.5-4.2-3.8-7.5-8-8 4.2-.5 7.5-3.8 8-8Z" />
          </svg>
          {title && (
            <span className="hidden min-w-0 truncate text-xs font-semibold text-muted md:inline">
              · {title}
            </span>
          )}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onNewChat}
          aria-label="New chat"
          title="New chat"
          className="hidden size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg min-[400px]:inline-flex sm:size-8 lg:hidden"
        >
          <NotePencil weight="bold" className="size-[17px]" aria-hidden />
        </button>

        {/* Grouped Appearance pill: Theme Sound + Theme Picker */}
        <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-hover/40 p-0.5">
          <ThemeAudioToggle />
          <ThemeMenu />
        </div>

        {/* Grouped Voice pill: Mic Input + Voice Mode */}
        {(voiceInput || voiceMenu) && (
          <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-hover/40 p-0.5">
            {voiceInput}
            {voiceMenu}
          </div>
        )}

        {/* Export yields its place on narrower phones */}
        <div className="hidden min-[520px]:block">
          <ExportMenu activeId={activeId} />
        </div>
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
        aria-label="Export chats"
        title="Export chats"
        className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface-hover/40 text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
      >
        <DownloadSimple weight="bold" className="size-4" aria-hidden />
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
          "absolute top-full right-0 z-30 mt-2 w-60 rounded-2xl glass-solid p-1.5",
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
