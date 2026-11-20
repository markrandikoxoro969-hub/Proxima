"use client";

import { DownloadSimple, List, NotePencil } from "@phosphor-icons/react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { exportUrl } from "@/lib/chat/client/api";
import { cn } from "@/lib/cn";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { site } from "@/lib/site";

export const ChatHeader = memo(function ChatHeader({
  title,
  activeId,
  sidebarOpen,
  isDesktop,
  onOpenSidebar,
  onNewChat,
}: {
  title: string | null;
  activeId: string | null;
  sidebarOpen: boolean;
  isDesktop: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-line px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-5">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open chat sessions"
        aria-controls="sidebar"
        aria-expanded={isDesktop ? undefined : sidebarOpen}
        className="inline-flex tap items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg lg:hidden"
      >
        <List weight="bold" className="size-5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1 px-1">
        <h1 className="flex items-center gap-2 text-base font-black tracking-tight sm:text-lg">
          {site.shortName} {/* ✦ drawn as SVG: not every phone font has the symbol. */}
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="inline-block size-3 align-[0.1em]"
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

      <button
        type="button"
        onClick={onNewChat}
        aria-label="New chat"
        className="inline-flex tap items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg lg:hidden"
      >
        <NotePencil weight="bold" className="size-5" aria-hidden />
      </button>
      <ThemeMenu />
      <ExportMenu activeId={activeId} />
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
