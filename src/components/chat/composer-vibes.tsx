"use client";

import { Check, FilmStrip, Image as ImageIcon, SmileyWink, Sparkle, X } from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useOptionalTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import {
  COMPOSER_MEMES,
  PEEKER_ASSET,
  pickPeekerQuip,
  type ComposerMemeKind,
} from "@/lib/chat/client/composer-memes";
import { useComposerVibes } from "@/lib/chat/client/use-composer-vibes";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion/tokens";
import { MEDIA_THEMES, getBuiltInTheme } from "@/lib/theme/palettes";
import { useMuffleThemeAudio } from "@/lib/theme/use-theme-audio";

export type ActiveComposerMeme = {
  id: number;
  kind: ComposerMemeKind;
  caption: string;
};

/**
 * Displays the active reactive meme (Glowing Red-Eye Skull or GTA WASTED)
 * floating cleanly above the chat typing box.
 */
export function ComposerMemeStage({
  active,
  onDismiss,
}: {
  active: ActiveComposerMeme | null;
  onDismiss: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2.5 flex justify-center px-3"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {active && active.kind === "skull" && (
          <m.button
            key={active.id}
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${COMPOSER_MEMES.skull.label} meme`}
            initial={{ opacity: 0, y: 18, scale: 0.55, rotate: -14 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              rotate: [-4, 5, -2, 0],
            }}
            exit={{ opacity: 0, y: 10, scale: 0.7, rotate: 8 }}
            transition={SPRING.snappy}
            className="pointer-events-auto mr-auto ml-1 flex items-center gap-2.5 rounded-2xl border border-red-500/35 bg-surface-solid py-1.5 pr-3.5 pl-2 shadow-glow-strong"
          >
            {/* Static transparent cutout from /public/media/memes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={COMPOSER_MEMES.skull.src}
              alt={COMPOSER_MEMES.skull.alt}
              width={56}
              height={64}
              className="meme-skull-pulse -my-2.5 h-14 w-auto shrink-0 object-contain"
            />
            <span className="flex flex-col text-left">
              <span className="text-[10px] font-extrabold tracking-[0.18em] text-red-400 uppercase">
                Vibe Check
              </span>
              <span className="text-sm font-black tracking-tight text-fg">{active.caption}</span>
            </span>
          </m.button>
        )}

        {active && active.kind === "wasted" && (
          <m.button
            key={active.id}
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${COMPOSER_MEMES.wasted.label} meme`}
            initial={{ opacity: 0, scale: 1.4, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 6 }}
            transition={{ type: "spring", stiffness: 360, damping: 24 }}
            className="pointer-events-auto relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border border-red-500/40 bg-black/90 px-6 py-2.5 shadow-glow-strong"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(80% 100% at 50% 50%, rgb(220 38 38 / 0.28), transparent 75%)",
              }}
            />
            {/* Static transparent cutout from /public/media/memes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={COMPOSER_MEMES.wasted.src}
              alt={COMPOSER_MEMES.wasted.alt}
              width={210}
              height={56}
              className="meme-wasted-pulse relative z-10 h-11 w-auto object-contain sm:h-12"
            />
            <span className="relative z-10 font-mono text-[10px] font-extrabold tracking-[0.26em] text-red-200/90 uppercase">
              {active.caption}
            </span>
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Cute anime companion peeking from the edge of the chat typing box.
 *
 * Her right edge is flush with the border she grips:
 *   - On md+ viewports she hugs the LEFT side of the composer (`right-[calc(100%-3px)]`).
 *   - On narrower viewports she tucks cleanly on the right edge above the composer
 *     so she never overflows horizontally.
 */
export function ComposerPeeker({
  focused,
  typing,
  streaming,
  pokeSignal = 0,
  className,
}: {
  focused: boolean;
  typing: boolean;
  streaming: boolean;
  /** Increment to trigger a playful hop + speech bubble from outside. */
  pokeSignal?: number;
  className?: string;
}) {
  const [prefs] = useComposerVibes();
  const [quip, setQuip] = useState<string | null>(null);
  const [hopCount, setHopCount] = useState(0);
  const timerRef = useRef<number | null>(null);
  const handledPoke = useRef(pokeSignal);

  const showQuip = useCallback(
    (nextCount: number) => {
      const mood = streaming ? "streaming" : typing ? "typing" : "idle";
      setQuip(pickPeekerQuip(mood, nextCount));
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setQuip(null), 2600);
    },
    [streaming, typing],
  );

  useEffect(() => {
    if (pokeSignal > handledPoke.current) {
      handledPoke.current = pokeSignal;
      const timer = window.setTimeout(() => {
        setHopCount((c) => {
          const next = c + 1;
          showQuip(next);
          return next;
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [pokeSignal, showQuip]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!prefs.peekerEnabled) return null;

  const engaged = focused || typing || streaming;

  const poke = () => {
    const next = hopCount + 1;
    setHopCount(next);
    showQuip(next);
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 select-none",
        // Mobile: tucked flush at right edge above the typing box
        "right-0 bottom-full -mb-2 md:right-[calc(100%-3px)] md:bottom-2 md:mb-0",
        className,
      )}
    >
      <AnimatePresence>
        {quip && (
          <m.div
            key={quip + hopCount}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.92 }}
            transition={SPRING.snappy}
            className="pointer-events-none absolute right-2 bottom-full mb-1.5 w-max max-w-[11rem] rounded-2xl rounded-br-sm border border-line bg-surface-solid px-2.5 py-1.5 text-[11px] font-bold text-fg shadow-glow md:right-1 md:rounded-2xl md:rounded-bl-sm"
          >
            {quip}
          </m.div>
        )}
      </AnimatePresence>

      <m.button
        type="button"
        onClick={poke}
        aria-label="Poke typing-box companion"
        title="Say hi!"
        animate={{
          x: engaged ? -3 : 3,
          y: streaming ? [0, -5, 0] : 0,
          rotate: hopCount > 0 ? [0, -6, 3, 0] : engaged ? -2 : 0,
        }}
        transition={
          streaming
            ? { y: { repeat: Infinity, duration: 1.4, ease: "easeInOut" }, x: SPRING.gentle }
            : SPRING.snappy
        }
        whileHover={{ x: -5, scale: 1.04 }}
        whileTap={{ scale: 0.94 }}
        className="pointer-events-auto block origin-bottom-right focus-visible:outline-2"
      >
        {/* Static transparent cutout from /public/media/memes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PEEKER_ASSET.src}
          alt={PEEKER_ASSET.alt}
          width={68}
          height={170}
          className="composer-peeker-float h-20 w-auto drop-shadow-[0_6px_14px_rgba(0,0,0,0.32)] md:h-28"
        />
      </m.button>
    </div>
  );
}

/**
 * Compact composer toolbar popover for:
 *   - Popping memes on demand (Skull, Wasted, Poke companion)
 *   - Toggling auto typing-box memes & peeking companion
 *   - One-tap switching between the live video / photo aesthetic themes
 */
export function VibeMenu({
  onTriggerMeme,
  onPokePeeker,
  syncAccount = true,
}: {
  onTriggerMeme: (kind: ComposerMemeKind) => void;
  onPokePeeker: () => void;
  syncAccount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [prefs, updatePrefs] = useComposerVibes();
  useMuffleThemeAudio(open, "vibe-menu");
  const themeCtx = useOptionalTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chooseTheme = (id: string) => {
    if (!themeCtx) return;
    themeCtx.setPalette(id);
    if (syncAccount) {
      const palette = getBuiltInTheme(id);
      api
        .updateProfile({ themePalette: id, ...(palette ? { theme: palette.mode } : {}) })
        .catch(() => {
          /* applied locally */
        });
    }
  };

  return (
    <div ref={rootRef} className="contents">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Memes and aesthetic vibes"
        title="Memes & aesthetic vibes"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={cn(
          "inline-flex tap shrink-0 items-center justify-center rounded-2xl transition-[color,background-color,transform] duration-200 active:scale-95",
          open || prefs.memesEnabled
            ? "text-[var(--accent-text)] hover:bg-surface-hover"
            : "text-muted hover:bg-surface-hover hover:text-fg",
        )}
      >
        <SmileyWink weight={open ? "fill" : "bold"} className="size-5" aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Memes and aesthetic vibes"
          className="animate-scale-in absolute bottom-full left-0 z-40 mb-2 w-[min(21rem,calc(100vw-1.5rem))] origin-bottom-left rounded-2xl glass-solid p-3 shadow-glow-strong"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.2em] text-subtle uppercase">
              <Sparkle weight="fill" className="size-3 text-[var(--accent-text)]" aria-hidden />
              Typing Box Memes
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close vibes menu"
              className="grid size-6 place-items-center rounded-lg text-subtle hover:bg-surface-hover hover:text-fg"
            >
              <X weight="bold" className="size-3.5" aria-hidden />
            </button>
          </div>

          {/* Instant pop triggers */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onTriggerMeme("skull");
                setOpen(false);
              }}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-hover/50 p-2 text-center transition-colors hover:border-red-400/50 hover:bg-surface-hover"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={COMPOSER_MEMES.skull.src} alt="" className="h-9 w-auto object-contain" />
              <span className="text-[11px] font-extrabold">Skull</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onTriggerMeme("wasted");
                setOpen(false);
              }}
              className="flex flex-col items-center justify-between gap-1.5 rounded-xl border border-line bg-surface-hover/50 p-2 text-center transition-colors hover:border-red-400/50 hover:bg-surface-hover"
            >
              <span className="flex h-9 items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={COMPOSER_MEMES.wasted.src} alt="" className="h-5 w-auto object-contain" />
              </span>
              <span className="text-[11px] font-extrabold">Wasted</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!prefs.peekerEnabled) updatePrefs({ peekerEnabled: true });
                onPokePeeker();
                setOpen(false);
              }}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-hover/50 p-2 text-center transition-colors hover:border-[var(--accent)]/50 hover:bg-surface-hover"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PEEKER_ASSET.src} alt="" className="h-9 w-auto object-contain" />
              <span className="text-[11px] font-extrabold">Peeker</span>
            </button>
          </div>

          {/* Toggles */}
          <div className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2.5">
            <VibeSwitch
              label="Auto typing memes"
              hint="Pops on bruh, cooked, wasted, rip, crash…"
              checked={prefs.memesEnabled}
              onChange={(checked) => updatePrefs({ memesEnabled: checked })}
            />
            <VibeSwitch
              label="Peeking companion"
              hint="Anime friend on the typing box edge"
              checked={prefs.peekerEnabled}
              onChange={(checked) => updatePrefs({ peekerEnabled: checked })}
            />
          </div>

          {/* Quick Live Theme strip */}
          {themeCtx && (
            <div className="mt-2.5 border-t border-line pt-2.5">
              <p className="mb-1.5 text-[10px] font-extrabold tracking-[0.2em] text-subtle uppercase">
                Quick Live Themes
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {MEDIA_THEMES.map((palette) => {
                  const active = themeCtx.theme.id === palette.id;
                  const thumb = palette.media?.poster ?? palette.media?.src;
                  const isVideo = palette.media?.kind === "video";
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => chooseTheme(palette.id)}
                      className={cn(
                        "group relative h-12 overflow-hidden rounded-xl border text-left transition-[border-color,transform] active:scale-95",
                        active ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/40" : "border-line",
                      )}
                      title={palette.name}
                    >
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="size-full object-cover"
                          style={{ objectPosition: palette.media?.position ?? "50% 40%" }}
                        />
                      )}
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
                      />
                      <span className="absolute top-1 left-1 text-white/85">
                        {isVideo ? (
                          <FilmStrip weight="fill" className="size-2.5" aria-hidden />
                        ) : (
                          <ImageIcon weight="fill" className="size-2.5" aria-hidden />
                        )}
                      </span>
                      {active && (
                        <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-white text-black">
                          <Check weight="bold" className="size-2.5" aria-hidden />
                        </span>
                      )}
                      <span className="absolute inset-x-1.5 bottom-1 truncate text-[10px] font-extrabold text-white">
                        {palette.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VibeSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="min-w-0">
        <span className="block text-xs font-bold text-fg">{label}</span>
        <span className="block truncate text-[10px] text-subtle">{hint}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
          checked ? "bg-[var(--accent)]" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "inline-block size-3.5 rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-4.5" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
