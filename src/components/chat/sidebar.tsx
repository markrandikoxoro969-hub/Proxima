"use client";

import {
  ChatCircleText,
  FacebookLogo,
  GearSix,
  PencilSimple,
  Planet,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import { m, useDragControls } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { ThemePreference } from "@/lib/theme";
import { useMuffleThemeAudio } from "@/lib/theme/use-theme-audio";
import type { EngineStatus, Profile, SessionSummary } from "@/lib/chat/types";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion/tokens";
import { site } from "@/lib/site";

const ENGINE_LABEL: Record<EngineStatus, string> = {
  checking: "Checking engine…",
  online: "Engine online",
  waking: "Engine waking up",
  offline: "Engine offline",
};
const ENGINE_DOT: Record<EngineStatus, string> = {
  checking: "bg-subtle",
  online: "bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129/0.7)]",
  waking: "bg-amber-400 animate-pulse",
  offline: "bg-red-500",
};

type SidebarProps = {
  sessions: SessionSummary[];
  activeKey: string;
  streamingKey: string | null;
  hasMore: boolean;
  engine: EngineStatus;
  profile: Profile;
  /** Mobile drawer state (ignored on large screens, where it's always shown). */
  open: boolean;
  isDesktop: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRequestDelete: (session: SessionSummary) => void;
  onLoadMore: () => void;
  onOpenSettings: () => void;
  onThemeChange: (theme: ThemePreference) => void;
};

export const Sidebar = memo(function Sidebar(props: SidebarProps) {
  const { open, isDesktop, onClose } = props;
  const panelRef = useRef<HTMLElement>(null);
  const controls = useDragControls();
  const hidden = !isDesktop && !open;
  useMuffleThemeAudio(!isDesktop && open, "mobile-sidebar");

  // Mobile: Escape closes the drawer, and focus moves into it when opened.
  useEffect(() => {
    if (isDesktop || !open) return;
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, open, onClose]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-premium lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <m.aside
        ref={panelRef}
        id="sidebar"
        aria-label="Chat sessions"
        inert={hidden || undefined}
        dragControls={controls}
        dragListener={false}
        initial={false}
        animate={isDesktop ? { y: 0 } : { y: open ? 0 : "100%" }}
        transition={SPRING.gentle}
        drag={isDesktop ? false : "y"}
        dragDirectionLock
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        onDragEnd={(_event, info) => {
          if (!isDesktop && (info.offset.y > 120 || info.velocity.y > 700)) onClose();
        }}
        className={cn(
          // Phones: a bottom sheet, dragged down to dismiss.
          "fixed inset-x-0 bottom-0 z-50 flex h-[86dvh] flex-col rounded-t-3xl border-t border-line bg-surface-solid pb-safe",
          // Desktop: the normal sidebar.
          "lg:static lg:z-auto lg:h-auto lg:w-72 lg:shrink-0 lg:translate-y-0 lg:rounded-none lg:border-t-0 lg:border-r lg:glass lg:bg-transparent lg:pb-0 lg:shadow-none lg:backdrop-blur-none",
        )}
      >
        {/* Drag handle: only this strip starts the dismiss gesture, so the
            session list still scrolls normally under a finger. */}
        <button
          type="button"
          aria-label="Drag down to close the menu"
          onPointerDown={(e) => controls.start(e)}
          className="mx-auto flex h-7 w-full shrink-0 items-center justify-center lg:hidden"
          style={{ touchAction: "none" }}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-line-strong" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SidebarContent {...props} />
        </div>
      </m.aside>
    </>
  );
});

function SidebarContent({
  sessions,
  activeKey,
  streamingKey,
  hasMore,
  engine,
  profile,
  onClose,
  onNewChat,
  onSelect,
  onRename,
  onRequestDelete,
  onLoadMore,
  onOpenSettings,
  onThemeChange,
}: SidebarProps) {
  const shownName = profile.displayName ?? profile.name ?? "Explorer";

  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <Planet weight="fill" className="size-7" aria-hidden />
          <span className="text-lg font-extrabold tracking-[0.2em]">{site.name}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="inline-flex tap items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg lg:hidden"
        >
          <X weight="bold" className="size-5" aria-hidden />
        </button>
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={onNewChat}
          className="group flex tap w-full items-center justify-center gap-2 rounded-2xl bg-inverse px-4 py-3 text-sm font-extrabold text-on-inverse shadow-glow transition-[transform,box-shadow] duration-300 ease-premium hover:shadow-glow-strong active:scale-[0.98]"
        >
          <Plus
            weight="bold"
            className="size-4 transition-transform duration-300 ease-premium group-hover:rotate-90"
            aria-hidden
          />
          New Chat
        </button>
      </div>

      <nav className="mt-6 flex min-h-0 flex-1 flex-col" aria-label="Recent sessions">
        <h2 className="px-5 pb-2 text-[10px] font-extrabold tracking-[0.3em] text-subtle uppercase">
          Recent Sessions
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {sessions.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-subtle">
              No chats yet. Your conversations will appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeKey}
                  streaming={session.id === streamingKey}
                  onSelect={onSelect}
                  onRename={onRename}
                  onRequestDelete={onRequestDelete}
                />
              ))}
            </ul>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-2 tap w-full rounded-xl text-xs font-bold text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
            >
              Load more
            </button>
          )}
        </div>
      </nav>

      <div className="flex flex-col gap-1 border-t border-line px-3 pt-3 pb-4">
        <div className="flex items-center gap-2.5 px-3 py-2" role="status" aria-live="polite">
          <span className={cn("size-2 rounded-full", ENGINE_DOT[engine])} aria-hidden />
          <span className="text-[10px] font-extrabold tracking-[0.25em] text-muted uppercase">
            {ENGINE_LABEL[engine]}
          </span>
        </div>
        <a
          href={site.links.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="flex tap items-center gap-3 rounded-xl px-3 text-xs font-bold tracking-[0.15em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
        >
          <FacebookLogo weight="fill" className="size-5" aria-hidden />
          Dev Facebook
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <Link
          href="/skills"
          onClick={onClose}
          className="flex tap items-center gap-3 rounded-xl px-3 text-xs font-bold tracking-[0.15em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
        >
          <Sparkle weight="bold" className="size-5" aria-hidden />
          Skills
        </Link>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex tap items-center gap-3 rounded-xl px-3 text-xs font-bold tracking-[0.15em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
        >
          <GearSix weight="bold" className="size-5" aria-hidden />
          Settings
        </button>

        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line bg-surface-hover p-2.5">
          {profile.image ? (
            <Image src={profile.image} alt="" width={40} height={40} className="size-10 rounded-xl" />
          ) : (
            <div
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-inverse text-base font-black text-on-inverse"
            >
              {shownName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold">{shownName}</p>
            <p className="text-[10px] font-bold tracking-[0.2em] text-subtle uppercase">Personal account</p>
          </div>
          <ThemeToggle onToggled={onThemeChange} />
        </div>
      </div>
    </>
  );
}

const SessionItem = memo(function SessionItem({
  session,
  active,
  streaming,
  onSelect,
  onRename,
  onRequestDelete,
}: {
  session: SessionSummary;
  active: boolean;
  streaming: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRequestDelete: (session: SessionSummary) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <li>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onRename(session.id, inputRef.current?.value ?? "");
            setEditing(false);
          }}
          className="px-1"
        >
          <label htmlFor={`rename-${session.id}`} className="sr-only">
            Rename chat
          </label>
          <input
            id={`rename-${session.id}`}
            ref={inputRef}
            defaultValue={session.title}
            maxLength={120}
            onBlur={(e) => {
              onRename(session.id, e.currentTarget.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setEditing(false);
              }
            }}
            className="h-11 w-full rounded-xl border border-line-strong bg-surface-solid px-3 text-sm font-semibold focus:outline-none"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="group/item relative">
      {active && (
        <m.span
          layoutId="active-session"
          transition={SPRING.soft}
          className="absolute inset-0 rounded-xl bg-surface-hover"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-12 w-full items-center gap-3 rounded-xl py-2 pr-[5.25rem] pl-3 text-left transition-colors duration-200",
          active ? "text-fg" : "text-muted hover:bg-surface-hover hover:text-fg",
        )}
      >
        <ChatCircleText weight={active ? "fill" : "bold"} className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{session.title}</span>
          <span className="block text-[10px] font-bold tracking-wider text-subtle">
            {streaming
              ? "Replying…"
              : `${session.messageCount} ${session.messageCount === 1 ? "message" : "messages"}`}
          </span>
        </span>
      </button>
      {/* Always visible on touch screens; on mouse screens they appear on hover/focus. */}
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-100 transition-opacity duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/item:opacity-100 [@media(hover:hover)]:group-hover/item:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Rename “${session.title}”`}
          className="inline-flex size-11 items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-fg pointer-fine:size-9"
        >
          <PencilSimple weight="bold" className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(session)}
          aria-label={`Delete “${session.title}”`}
          className="inline-flex size-11 items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-red-500/10 hover:text-red-500 pointer-fine:size-9"
        >
          <Trash weight="bold" className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
});
