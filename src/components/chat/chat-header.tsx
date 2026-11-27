"use client";

import {
  CaretDown,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  List,
  MagnifyingGlass,
  NotePencil,
  Palette,
  Planet,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { exportUrl } from "@/lib/chat/client/api";
import { cn } from "@/lib/cn";
import { ThemeAudioToggle } from "@/components/theme/theme-audio-toggle";
import { ThemeMenuContent } from "@/components/theme/theme-menu";
import { useTheme } from "@/components/theme/theme-provider";
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
  const { theme } = useTheme();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [panelView, setPanelView] = useState<"main" | "themes">("main");
  const [hasMorphed, setHasMorphed] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const controlsMenuId = useId();

  const closeControls = () => {
    setControlsOpen(false);
    setPanelView("main");
    setHasMorphed(false);
  };

  useEffect(() => {
    if (!controlsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (controlsRef.current?.contains(target)) return;
      // Do not dismiss when interacting with a portaled modal/dialog opened from inside Controls.
      if (target.closest('[role="dialog"]')) return;
      closeControls();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (panelView === "themes") {
        setHasMorphed(true);
        setPanelView("main");
      } else {
        closeControls();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [controlsOpen, panelView]);

  return (
    <div className="shrink-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-4">
      <header className="relative z-20 mx-auto flex max-w-5xl items-center gap-1.5 rounded-[1.5rem] px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
        {/*
         * Separate sibling backdrop layer so <header> itself does NOT become a CSS Backdrop Root;
         * this allows the floating Controls / Themes dropdown below to apply real backdrop-filter
         * blur over the scrolling chat messages behind it.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-[1.5rem] glass-header"
        />
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

          {/* Aesthetic floating glass options hub that smoothly morphs in place into Themes */}
          <div ref={controlsRef} className="relative">
            <button
              type="button"
              onClick={() => {
                if (controlsOpen) {
                  closeControls();
                } else {
                  setPanelView("main");
                  setHasMorphed(false);
                  setControlsOpen(true);
                }
              }}
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
              aria-label={panelView === "themes" ? "Theme menu" : "Workspace controls"}
              hidden={!controlsOpen}
              className={cn(
                "absolute top-full right-0 z-30 mt-2.5 overflow-visible rounded-3xl glass-dropdown p-3 transition-[width] duration-300 ease-premium",
                panelView === "themes" ? "w-[min(92vw,22rem)]" : "w-[min(90vw,18.5rem)]",
                controlsOpen && "animate-scale-in",
              )}
            >
              {/* Main Controls View — kept mounted (hidden when morphed) so active Mic / Voice audio never unmounts */}
              <div
                hidden={panelView !== "main"}
                className={cn(panelView === "main" && hasMorphed && "animate-controls-morph-back")}
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
                  <div className="space-y-1.5">
                    {/* Morphs this floating glass card smoothly in place into the Theme menu */}
                    <button
                      type="button"
                      onClick={() => {
                        setHasMorphed(true);
                        setPanelView("themes");
                      }}
                      aria-label="Open theme menu"
                      className="flex w-full items-center justify-between gap-2.5 rounded-2xl glass-pill px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--glass-border-strong)] hover:bg-surface-hover"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-fg">
                          <Palette weight="bold" className="size-4.5" aria-hidden />
                          <span
                            aria-hidden
                            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface-solid"
                            style={{ backgroundColor: theme.tokens.accent }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-extrabold tracking-wide text-fg uppercase">
                            Themes
                          </span>
                          <span className="block truncate text-[11px] font-medium text-muted">
                            {theme.name}
                          </span>
                        </span>
                      </span>
                      <CaretRight weight="bold" className="size-4 shrink-0 text-subtle" aria-hidden />
                    </button>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-2xl glass-pill p-1.5">
                      <div className="flex items-center gap-1">
                        {!voiceInput && !voiceMenu && <ThemeAudioToggle />}
                        {onOpenPalette && (
                          <button
                            type="button"
                            onClick={() => {
                              closeControls();
                              onOpenPalette();
                            }}
                            aria-label="Open command palette"
                            title="Quick search"
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold tracking-[0.14em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                          >
                            <MagnifyingGlass weight="bold" className="size-4.5" aria-hidden />
                            <span>Search</span>
                          </button>
                        )}
                      </div>
                      <ExportMenu activeId={activeId} onAfterSelect={closeControls} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Smoothly Morphed In-Place Theme Menu View */}
              {panelView === "themes" && (
                <div role="menu" aria-label="Theme" className="animate-controls-morph-in">
                  <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHasMorphed(true);
                        setPanelView("main");
                      }}
                      aria-label="Back to controls"
                      className="inline-flex h-8 items-center gap-1 rounded-full glass-pill px-2.5 text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                    >
                      <CaretLeft weight="bold" className="size-3.5" aria-hidden />
                      <span>Back</span>
                    </button>
                    <span className="flex items-center gap-1.5 pr-1 text-xs font-extrabold tracking-[0.14em] text-fg uppercase">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: theme.tokens.accent }}
                      />
                      Themes
                    </span>
                  </div>
                  <div className="max-h-[min(68dvh,28rem)] overflow-y-auto overscroll-contain pr-0.5">
                    <ThemeMenuContent syncAccount onAfterSelect={closeControls} />
                  </div>
                </div>
              )}
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
