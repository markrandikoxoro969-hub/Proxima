"use client";

import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Small notifications ("Settings saved", "File too big"…).
 * - Text is rendered by React → always escaped (the original file built toast
 *   HTML from file names, which allowed script injection).
 * - Screen readers announce them (role=status / role=alert for errors).
 * - Max 3 at once; info/success hide after 3s, errors after 5s.
 */
export type ToastKind = "info" | "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind };
type Notify = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<Notify | null>(null);

const ICONS = { info: Info, success: CheckCircle, error: WarningCircle } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const notify = useCallback<Notify>(
    (message, kind = "info") => {
      const id = nextId.current++;
      setToasts((list) => {
        // Don't stack the same message twice.
        const withoutDupes = list.filter((t) => t.message !== message);
        return [...withoutDupes, { id, message, kind }].slice(-3);
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), kind === "error" ? 5000 : 3000),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[150] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:items-end sm:pr-6"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.kind];
            return (
              <m.div
                key={toast.id}
                role={toast.kind === "error" ? "alert" : "status"}
                initial={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl glass-solid py-3 pr-2 pl-4 text-sm font-semibold",
                  toast.kind === "error" && "border-red-500/30",
                )}
              >
                <Icon
                  weight="fill"
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    toast.kind === "error" && "text-red-500",
                    toast.kind === "success" && "text-emerald-500",
                    toast.kind === "info" && "text-muted",
                  )}
                />
                <p className="min-w-0 flex-1 py-0.5 break-words">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="-my-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                >
                  <X weight="bold" className="size-4" aria-hidden />
                </button>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}

export function useToast(): Notify {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
