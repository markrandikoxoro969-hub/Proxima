"use client";

import {
  CaretDown,
  DownloadSimple,
  List,
  MagnifyingGlass,
  NotePencil,
  Planet,
  SlidersHorizontal,
} from "@phosphor-icons/react";
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
  /** Speech-input trigger, organized inside the floating glass controls menu. */
  voiceInput?: ReactNode;
  /** Voice-mode trigger, organized inside the floating glass controls menu. */
  voiceMenu?: ReactNode;
}) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const controlsMenuId = useId();

  useEffect(() => {
    if (!controlsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (controlsRef.current?.contains(target)) return;
      // Do not dismiss when interacting with a portaled modal/dialog opened from inside Controls.
      if (target.closest('[role="dialog"]')) return;
      setControlsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setControlsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [controlsOpen]);

  return (
    <div className="shrink-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-4">
      <header className="relative z-20 mx-auto flex max-w-5xl items-center gap-1.5 rounded-[1.5rem] glass-header px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open chat sessions"
          aria-controls="sidebar"
          aria-expanded={isDesktop ? undefined : sidebarOpen}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg sm:size-10 lg:hidden"
        >
          <List weight="bold" className="size-5" aria-hidden />
        </button>

        {desktopCollapsed && onToggleDesktopSidebar && (
          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="hidden size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg lg:inline-flex"
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
          <h1 className="flex items-center gap-2 text-base font-black tracking-tight sm:text-lg">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full glass-pill">
              <Planet weight="fill" className="size-4 text-fg proxima-logo-glow" aria-hidden />
            </span>
            <span className="proxima-text-glow">{site.shortName}</span>
            {title && (
              <span className="hidden min-w-0 truncate text-sm font-semibold text-muted md:inline">
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
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg sm:size-10 lg:hidden"
          >
            <NotePencil weight="bold" className="size-4.5" aria-hidden />
          </button>

          {/* Aesthetic floating glass options hub: Mic, Speaker, Sound, Themes, Search & Export */}
          <div ref={controlsRef} className="relative">
            <button
              type="button"
              onClick={() => setControlsOpen((open) => !open)}
              aria-label="Open controls menu"
              aria-haspopup="menu"
              aria-expanded={controlsOpen}
              aria-controls={controlsMenuId}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full glass-pill px-3 text-xs font-extrabold tracking-[0.12em] uppercase transition-colors duration-200 hover:border-[var(--glass-border-strong)] hover:bg-surface-hover hover:text-fg sm:h-10 sm:px-3.5",
                controlsOpen ? "border-[var(--glass-border-strong)] text-fg" : "text-muted",
              )}
            >
              <SlidersHorizontal weight="bold" className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Controls</span>
              <CaretDown
                weight="bold"
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200",
                  controlsOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            <div
              id={controlsMenuId}
              role="region"
              aria-label="Workspace controls"
              hidden={!controlsOpen}
              className={cn(
                "absolute top-full right-0 z-30 mt-2.5 w-[min(90vw,18.5rem)] overflow-visible rounded-3xl glass-dropdown p-3",
                controlsOpen && "animate-scale-in",
              )}
            >
              {(voiceInput || voiceMenu) && (
                <div className="mb-2.5">
                  <p className="mb-1.5 px-1 text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                    Voice & Audio
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-2xl glass-pill p-1.5">
                    <div className="flex items-center gap-1">
                      {voiceInput}
                      {voiceMenu}
                    </div>
                    <ThemeAudioToggle />
                  </div>
                </div>
              )}

              <div>
                <p className="mb-1.5 px-1 text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                  Appearance & Tools
                </p>
                <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-2xl glass-pill p-1.5">
                  <div className="flex items-center gap-1">
                    {!voiceInput && !voiceMenu && <ThemeAudioToggle />}
                    <ThemeMenu />
                    {onOpenPalette && (
                      <button
                        type="button"
                        onClick={() => {
                          setControlsOpen(false);
                          onOpenPalette();
                        }}
                        aria-label="Open command palette"
                        title="Quick search"
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                      >
                        <MagnifyingGlass weight="bold" className="size-4.5" aria-hidden />
                      </button>
                    )}
                  </div>
                  <ExportMenu activeId={activeId} onAfterSelect={() => setControlsOpen(false)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
});

/** Export menu: download this chat or all chats as Markdown or JSON. */
function ExportMenu({
  activeId,
  onAfterSelect,
}: {
  activeId: string | null;
  onAfterSelect?: () => void;
}) {
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
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold tracking-[0.14em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
      >
        <DownloadSimple weight="bold" className="size-4.5" aria-hidden />
        <span>Export</span>
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
          "absolute top-full right-0 z-40 mt-2 w-56 rounded-2xl glass-dropdown p-1.5",
          open && "animate-scale-in",
        )}
      >
        {items.map((item) => (
          <a
            key={item.href}
            role="menuitem"
            href={item.href}
            download
            onClick={() => {
              setOpen(false);
              onAfterSelect?.();
            }}
            className="flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
