"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { useMuffleThemeAudio } from "@/lib/theme/use-theme-audio";
import { Button } from "./button";

/**
 * Accessible pop-up built on the browser's native <dialog>:
 *  - Escape closes it, clicking the dark backdrop closes it.
 *  - Focus is kept inside while open and returns to the button that opened it.
 *  - The page behind can't be clicked or reached with Tab.
 * (The original settings modal had none of these.)
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  hideClose?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  useMuffleThemeAudio(open, "dialog");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault(); // we close through React state instead
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl glass-dialog p-0 text-fg",
        "max-h-[min(90dvh,48rem)] overflow-y-auto overscroll-contain",
        "backdrop:bg-black/55 backdrop:backdrop-blur-[3px] open:animate-scale-in",
        className,
      )}
    >
      {open && (
        <div className="p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-black tracking-tight">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mt-1 -mr-2 inline-flex tap items-center justify-center rounded-xl text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
              >
                <X weight="bold" className="size-5" aria-hidden />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** "Are you sure?" pop-up for destructive actions (delete chat, clear all). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={message} hideClose className="max-w-sm">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
