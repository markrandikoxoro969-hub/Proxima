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
  SpeakerHigh,
  SpeakerSlash,
  TerminalWindow,
  Waveform,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { exportUrl } from "@/lib/chat/client/api";
import { VOICE_PROFILES } from "@/lib/chat/client/voice";
import type { VoiceMenuProps } from "@/components/chat/voice-menu";
import { cn } from "@/lib/cn";
import { ThemeAudioToggle } from "@/components/theme/theme-audio-toggle";
import { useTheme } from "@/components/theme/theme-provider";
import { useMuffleThemeAudio } from "@/lib/theme/use-theme-audio";
import { site } from "@/lib/site";

const ThemeMenuContent = dynamic(
  () => import("@/components/theme/theme-menu").then((mod) => mod.ThemeMenuContent),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 py-2" aria-busy="true">
        <div className="h-12 animate-pulse rounded-xl bg-surface-hover" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 animate-pulse rounded-xl bg-surface-hover" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-hover" />
        </div>
      </div>
    ),
  },
);

const VoiceMenuContent = dynamic(
  () => import("@/components/chat/voice-menu").then((mod) => mod.VoiceMenuContent),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 py-2" aria-busy="true">
        <div className="h-12 animate-pulse rounded-xl bg-surface-hover" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-14 animate-pulse rounded-xl bg-surface-hover" />
          <div className="h-14 animate-pulse rounded-xl bg-surface-hover" />
        </div>
      </div>
    ),
  },
);

type PanelView = "main" | "sound" | "themes" | "export";

const MORPH_EASE = [0.22, 1, 0.36, 1] as const;

export const ChatHeader = memo(function ChatHeader({
  title,
  activeId,
  sidebarOpen,
  isDesktop,
  desktopCollapsed = false,
  onToggleDesktopSidebar,
  onOpenPalette,
  onOpenSandbox,
  onOpenSidebar,
  onNewChat,
  voiceInput,
  voiceMenu,
  voiceMenuProps,
}: {
  title: string | null;
  activeId: string | null;
  sidebarOpen: boolean;
  isDesktop: boolean;
  desktopCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
  onOpenPalette?: () => void;
  onOpenSandbox?: () => void;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  /** Speech-input trigger, organized inside the floating glass controls menu. */
  voiceInput?: ReactNode;
  /** Optional custom voice trigger node (kept for compatibility; prefer voiceMenuProps for in-place morphing). */
  voiceMenu?: ReactNode;
  /** Voice & sound settings wired directly into the smoothly morphing Sound sub-menu. */
  voiceMenuProps?: VoiceMenuProps;
}) {
  const { theme } = useTheme();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>("main");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const controlsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const controlsMenuId = useId();

  useMuffleThemeAudio(controlsOpen && panelView === "sound", "header-sound-menu");

  const closeControls = useCallback(() => {
    setControlsOpen(false);
    setPanelView("main");
    setDirection(1);
    setContentHeight(undefined);
  }, []);

  const navigateView = useCallback((next: PanelView) => {
    setDirection(next === "main" ? -1 : 1);
    setPanelView(next);
  }, []);

  // Measure active view height continuously so the floating glass card morphs its height smoothly.
  useLayoutEffect(() => {
    if (!controlsOpen) return;
    const node = measureRef.current;
    if (!node) return;
    const sync = () => {
      const h = node.offsetHeight;
      if (h > 0) setContentHeight(h);
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [controlsOpen, panelView]);

  useEffect(() => {
    if (!controlsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (controlsRef.current?.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      closeControls();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (panelView !== "main") {
        navigateView("main");
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
  }, [controlsOpen, panelView, closeControls, navigateView]);

  const exportItems = [
    ...(activeId
      ? [
          { label: "This chat · Markdown", href: exportUrl(activeId, "md") },
          { label: "This chat · JSON", href: exportUrl(activeId, "json") },
        ]
      : []),
    { label: "All chats · Markdown", href: exportUrl(null, "md") },
    { label: "All chats · JSON", href: exportUrl(null, "json") },
  ];

  const voiceEnabled = voiceMenuProps?.settings.enabled ?? false;
  const voiceSpeaking = voiceMenuProps?.speaking ?? false;
  const activeVoiceLabel = voiceMenuProps
    ? VOICE_PROFILES[voiceMenuProps.settings.voice].label
    : null;

  const panelWidthClass =
    panelView === "themes" || panelView === "sound"
      ? "w-[min(92vw,22rem)]"
      : "w-[min(90vw,19rem)]";

  const viewAriaLabel =
    panelView === "themes"
      ? "Theme menu"
      : panelView === "sound"
        ? "Sound and voice menu"
        : panelView === "export"
          ? "Export menu"
          : "Workspace controls";

  return (
    <div className="shrink-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-4">
      <header className="relative z-20 mx-auto flex max-w-5xl items-center gap-1.5 rounded-[1.5rem] px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
        {/*
         * Separate sibling backdrop layer so <header> itself does NOT become a CSS Backdrop Root;
         * this allows the floating Controls / Sound / Themes card below to apply real backdrop-filter
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

          {/* Unified liquid-morphing frosted glass hub: Controls ↔ Sound & Voice ↔ Themes ↔ Export */}
          <div ref={controlsRef} className="relative">
            <button
              type="button"
              onClick={() => {
                if (controlsOpen) {
                  closeControls();
                } else {
                  setPanelView("main");
                  setDirection(1);
                  setControlsOpen(true);
                }
              }}
              aria-label="Open controls menu"
              aria-haspopup="menu"
              aria-expanded={controlsOpen}
              aria-controls={controlsMenuId}
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-full glass-pill px-3 text-xs font-extrabold tracking-[0.12em] uppercase transition-colors duration-200 hover:border-[var(--glass-border-strong)] hover:bg-surface-hover hover:text-fg sm:h-10 sm:px-3.5",
                controlsOpen ? "border-[var(--glass-border-strong)] text-fg" : "text-muted",
              )}
            >
              <SlidersHorizontal weight="bold" className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Controls</span>
              {voiceEnabled && (
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full bg-[var(--accent)]",
                    voiceSpeaking && "animate-pulse",
                  )}
                />
              )}
              <CaretDown
                weight="bold"
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200",
                  controlsOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            <AnimatePresence>
              {controlsOpen && (
                <m.div
                  id={controlsMenuId}
                  role="region"
                  aria-label={viewAriaLabel}
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: MORPH_EASE }}
                  className={cn(
                    "absolute top-full right-0 z-30 mt-2.5 overflow-hidden rounded-3xl glass-dropdown p-3 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    panelWidthClass,
                  )}
                >
                  <div
                    className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={contentHeight ? { height: contentHeight } : undefined}
                  >
                    <div ref={measureRef}>
                      <AnimatePresence mode="wait" initial={false} custom={direction}>
                        {panelView === "main" && (
                          <m.div
                            key="main"
                            custom={direction}
                            initial={{ opacity: 0, x: direction * -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: direction * -16 }}
                            transition={{ duration: 0.2, ease: MORPH_EASE }}
                            className="space-y-2.5"
                          >
                            {/* Voice & Audio quick bar + Sound morph row */}
                            <div>
                              <p className="mb-1.5 px-1 text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                                Voice &amp; Sound
                              </p>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1.5 rounded-2xl glass-pill p-1.5">
                                  <div className="flex items-center gap-1">
                                    {voiceInput}
                                    {!voiceMenuProps && voiceMenu}
                                  </div>
                                  <ThemeAudioToggle />
                                </div>

                                {voiceMenuProps && (
                                  <button
                                    type="button"
                                    onClick={() => navigateView("sound")}
                                    aria-label="Open sound and voice menu"
                                    className="flex w-full items-center justify-between gap-2.5 rounded-2xl glass-pill px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--glass-border-strong)] hover:bg-surface-hover"
                                  >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                      <span
                                        className={cn(
                                          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-xl",
                                          voiceEnabled
                                            ? "bg-[var(--accent)]/15 text-[var(--accent-text)]"
                                            : "bg-surface-hover text-fg",
                                        )}
                                      >
                                        {voiceEnabled ? (
                                          <SpeakerHigh weight="fill" className="size-4.5" aria-hidden />
                                        ) : (
                                          <SpeakerSlash weight="bold" className="size-4.5" aria-hidden />
                                        )}
                                        {voiceEnabled && (
                                          <span
                                            aria-hidden
                                            className={cn(
                                              "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[var(--accent)] ring-2 ring-surface-solid",
                                              voiceSpeaking && "animate-pulse",
                                            )}
                                          />
                                        )}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block text-xs font-extrabold tracking-wide text-fg uppercase">
                                          Sound &amp; Voice
                                        </span>
                                        <span className="block truncate text-[11px] font-medium text-muted">
                                          {voiceEnabled
                                            ? `${activeVoiceLabel} · On`
                                            : `${activeVoiceLabel} · Off`}
                                        </span>
                                      </span>
                                    </span>
                                    <CaretRight
                                      weight="bold"
                                      className="size-4 shrink-0 text-subtle"
                                      aria-hidden
                                    />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Appearance & Workspace tools */}
                            <div>
                              <p className="mb-1.5 px-1 text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                                Appearance &amp; Tools
                              </p>
                              <div className="space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => navigateView("themes")}
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
                                  <CaretRight
                                    weight="bold"
                                    className="size-4 shrink-0 text-subtle"
                                    aria-hidden
                                  />
                                </button>

                                {onOpenSandbox && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      closeControls();
                                      onOpenSandbox();
                                    }}
                                    aria-label="Open code sandbox"
                                    className="flex w-full items-center justify-between gap-2.5 rounded-2xl glass-pill px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--glass-border-strong)] hover:bg-surface-hover"
                                  >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-fg">
                                        <TerminalWindow weight="bold" className="size-4.5" aria-hidden />
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block text-xs font-extrabold tracking-wide text-fg uppercase">
                                          Sandbox
                                        </span>
                                        <span className="block truncate text-[11px] font-medium text-muted">
                                          Live code preview &amp; .zip
                                        </span>
                                      </span>
                                    </span>
                                    <CaretRight
                                      weight="bold"
                                      className="size-4 shrink-0 text-subtle"
                                      aria-hidden
                                    />
                                  </button>
                                )}

                                <div className="flex items-center justify-between gap-1.5 rounded-2xl glass-pill p-1.5">
                                  {onOpenPalette ? (
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
                                  ) : (
                                    <span />
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => navigateView("export")}
                                    aria-label="Open export menu"
                                    className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold tracking-[0.14em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                                  >
                                    <DownloadSimple weight="bold" className="size-4.5" aria-hidden />
                                    <span>Export</span>
                                    <CaretRight weight="bold" className="size-3.5 text-subtle" aria-hidden />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </m.div>
                        )}

                        {panelView === "sound" && voiceMenuProps && (
                          <m.div
                            key="sound"
                            role="dialog"
                            aria-label="Sound and voice"
                            initial={{ opacity: 0, x: 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 18 }}
                            transition={{ duration: 0.2, ease: MORPH_EASE }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
                              <button
                                type="button"
                                onClick={() => navigateView("main")}
                                aria-label="Back to controls"
                                className="inline-flex h-8 items-center gap-1 rounded-full glass-pill px-2.5 text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                              >
                                <CaretLeft weight="bold" className="size-3.5" aria-hidden />
                                <span>Back</span>
                              </button>
                              <span className="flex items-center gap-1.5 pr-1 text-xs font-extrabold tracking-[0.14em] text-fg uppercase">
                                <Waveform
                                  weight="bold"
                                  aria-hidden
                                  className={cn(
                                    "size-4 text-subtle",
                                    voiceSpeaking && "animate-pulse text-[var(--accent-text)]",
                                  )}
                                />
                                Sound &amp; Voice
                              </span>
                            </div>
                            <div className="max-h-[min(68dvh,28rem)] overflow-y-auto overscroll-contain pr-0.5">
                              <VoiceMenuContent {...voiceMenuProps} showHeader={false} />
                            </div>
                          </m.div>
                        )}

                        {panelView === "themes" && (
                          <m.div
                            key="themes"
                            role="menu"
                            aria-label="Theme"
                            initial={{ opacity: 0, x: 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 18 }}
                            transition={{ duration: 0.2, ease: MORPH_EASE }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
                              <button
                                type="button"
                                onClick={() => navigateView("main")}
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
                          </m.div>
                        )}

                        {panelView === "export" && (
                          <m.div
                            key="export"
                            role="menu"
                            aria-label="Export"
                            initial={{ opacity: 0, x: 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 18 }}
                            transition={{ duration: 0.2, ease: MORPH_EASE }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
                              <button
                                type="button"
                                onClick={() => navigateView("main")}
                                aria-label="Back to controls"
                                className="inline-flex h-8 items-center gap-1 rounded-full glass-pill px-2.5 text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                              >
                                <CaretLeft weight="bold" className="size-3.5" aria-hidden />
                                <span>Back</span>
                              </button>
                              <span className="pr-1 text-xs font-extrabold tracking-[0.14em] text-fg uppercase">
                                Export
                              </span>
                            </div>
                            <div className="space-y-1">
                              {exportItems.map((item) => (
                                <a
                                  key={item.href}
                                  role="menuitem"
                                  href={item.href}
                                  download
                                  onClick={closeControls}
                                  className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                                >
                                  <DownloadSimple weight="bold" className="size-4 text-muted" aria-hidden />
                                  {item.label}
                                </a>
                              ))}
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
    </div>
  );
});
