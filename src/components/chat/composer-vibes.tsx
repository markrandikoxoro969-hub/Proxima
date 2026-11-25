"use client";

import { Check, FilmStrip, Image as ImageIcon, SmileyWink, Sparkle, X } from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useOptionalTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import {
  COMPOSER_MEMES,
  PEEKER_COMPANIONS,
  getPeekerCompanion,
  pickPeekerQuip,
  type ComposerMemeKind,
  type PeekerCompanionId,
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
      className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 flex justify-center px-3"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {active && active.kind === "skull" && (
          <m.button
            key={active.id}
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${COMPOSER_MEMES.skull.label} meme`}
            initial={{ opacity: 0, y: 16, scale: 0.6, rotate: -12 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              rotate: [-3, 4, -2, 0],
            }}
            exit={{ opacity: 0, y: 8, scale: 0.75, rotate: 6 }}
            transition={SPRING.snappy}
            className="pointer-events-auto mr-auto ml-1 flex items-center gap-2 rounded-2xl border border-red-500/35 bg-surface-solid py-1.5 pr-3 pl-2 shadow-lg"
          >
            {/* Static transparent cutout from /public/media/memes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={COMPOSER_MEMES.skull.src}
              alt={COMPOSER_MEMES.skull.alt}
              width={48}
              height={54}
              className="meme-skull-pulse -my-2 h-12 w-auto shrink-0 object-contain"
            />
            <span className="flex flex-col text-left">
              <span className="text-[10px] font-extrabold tracking-[0.16em] text-red-400 uppercase">
                Vibe Check
              </span>
              <span className="text-xs font-black tracking-tight text-fg sm:text-sm">
                {active.caption}
              </span>
            </span>
          </m.button>
        )}

        {active && active.kind === "wasted" && (
          <m.button
            key={active.id}
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${COMPOSER_MEMES.wasted.label} meme`}
            initial={{ opacity: 0, scale: 1.32, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 4 }}
            transition={{ type: "spring", stiffness: 360, damping: 24 }}
            className="pointer-events-auto relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border border-red-500/40 bg-black/90 px-5 py-2 shadow-lg"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(80% 100% at 50% 50%, rgb(220 38 38 / 0.26), transparent 75%)",
              }}
            />
            {/* Static transparent cutout from /public/media/memes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={COMPOSER_MEMES.wasted.src}
              alt={COMPOSER_MEMES.wasted.alt}
              width={185}
              height={48}
              className="meme-wasted-pulse relative z-10 h-10 w-auto object-contain sm:h-11"
            />
            <span className="relative z-10 font-mono text-[10px] font-extrabold tracking-[0.24em] text-red-200/90 uppercase">
              {active.caption}
            </span>
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Anime companion anchored cleanly to the chat typing box — zero exposed cut
 * edges and zero continuous 60fps idle animations (so HD video themes stay
 * silky smooth).
 *
 * Anchor modes:
 * - `ledge`: manga girl peeking over the top horizontal rim of the composer,
 *   with her hands overlapping the top border on both desktop and mobile.
 * - `chibi`: compact transparent sticker perched cleanly on the top-right rim
 *   of the composer.
 * - `screen-right`: side-wall peeker anchored flush against the right edge of
 *   the viewport (`fixed right-0`), never floating in mid-air as a straight line.
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

  const companion = getPeekerCompanion(prefs.peekerId);

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

  const isScreenRight = companion.anchor === "screen-right";
  const isLedge = companion.anchor === "ledge";

  return (
    <div
      className={cn(
        "pointer-events-none z-20 select-none",
        isScreenRight
          ? "fixed right-0 bottom-24 sm:bottom-28"
          : isLedge
            ? "absolute right-4 bottom-full -mb-[14px] sm:right-6 sm:-mb-[17px]"
            : "absolute right-4 bottom-full -mb-[4px] sm:right-6",
        className,
      )}
    >
      <AnimatePresence>
        {quip && (
          <m.div
            key={quip + hopCount}
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.94 }}
            transition={SPRING.snappy}
            className="pointer-events-none absolute right-1 bottom-full mb-1.5 w-max max-w-[11rem] rounded-2xl rounded-br-sm border border-line bg-surface-solid px-2.5 py-1 text-[11px] font-bold text-fg shadow-md"
          >
            {quip}
          </m.div>
        )}
      </AnimatePresence>

      <m.button
        type="button"
        onClick={poke}
        aria-label={`Poke ${companion.label} companion`}
        title={`${companion.label} — click to say hi!`}
        animate={
          isScreenRight
            ? {
                x: engaged ? -3 : 2,
                rotate: hopCount > 0 ? [0, -5, 2, 0] : 0,
              }
            : {
                y: engaged ? -2 : 0,
                rotate: hopCount > 0 ? [0, -4, 3, 0] : 0,
              }
        }
        transition={SPRING.snappy}
        whileHover={isScreenRight ? { x: -5, scale: 1.03 } : { y: -4, scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "pointer-events-auto block focus-visible:outline-2",
          isScreenRight ? "origin-bottom-right" : "origin-bottom",
        )}
      >
        {/* Static transparent cutout from /public/media/memes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={companion.src}
          alt={companion.alt}
          width={companion.width}
          height={companion.height}
          decoding="async"
          className={cn(
            "w-auto object-contain",
            isScreenRight
              ? "h-24 sm:h-28"
              : isLedge
                ? "h-[52px] sm:h-[64px]"
                : "h-[56px] sm:h-[68px]",
          )}
        />
      </m.button>
    </div>
  );
}

/**
 * Compact composer toolbar popover for:
 *   - Popping memes on demand (Skull, Wasted)
 *   - Picking any of the 7 anime companions (Ledge, Rift, Anya, Gojo, Kiyo, Kanna, Wall)
 *   - Toggling auto typing-box memes & companion
 *   - One-tap switching between all 10 live video / photo aesthetic themes
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

  const chooseCompanion = (id: PeekerCompanionId) => {
    updatePrefs({ peekerEnabled: true, peekerId: id });
    onPokePeeker();
  };

  return (
    <div ref={rootRef} className="contents">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Memes and aesthetic vibes"
        title="Memes, companions & vibes"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[color,background-color,transform] duration-150 active:scale-95 sm:size-8",
          open || prefs.memesEnabled
            ? "text-[var(--accent-text)] hover:bg-surface-hover"
            : "text-muted hover:bg-surface-hover hover:text-fg",
        )}
      >
        <SmileyWink weight={open ? "fill" : "bold"} className="size-[18px]" aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Memes and aesthetic vibes"
          className="animate-scale-in absolute bottom-full left-0 z-40 mb-2 max-h-[min(74dvh,32rem)] w-[min(21.5rem,calc(100vw-1.5rem))] origin-bottom-left overflow-y-auto overscroll-contain rounded-2xl glass-solid p-2.5 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
              <Sparkle weight="fill" className="size-3 text-[var(--accent-text)]" aria-hidden />
              Memes &amp; Companions
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

          {/* Instant pop meme triggers */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onTriggerMeme("skull");
                setOpen(false);
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-hover/50 px-2.5 py-1.5 text-left transition-colors hover:border-red-400/50 hover:bg-surface-hover"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={COMPOSER_MEMES.skull.src} alt="" className="h-7 w-auto object-contain" />
              <span className="text-[11px] font-extrabold">Pop Skull</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onTriggerMeme("wasted");
                setOpen(false);
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-hover/50 px-2.5 py-1.5 text-left transition-colors hover:border-red-400/50 hover:bg-surface-hover"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={COMPOSER_MEMES.wasted.src} alt="" className="h-4 w-auto object-contain" />
              <span className="text-[11px] font-extrabold">Wasted</span>
            </button>
          </div>

          {/* Companion character picker */}
          <div className="mt-2.5 border-t border-line pt-2">
            <div className="mb-1.5 flex items-center justify-between px-0.5">
              <p className="text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                Typing Box Companion
              </p>
              <button
                type="button"
                onClick={() => updatePrefs({ peekerEnabled: !prefs.peekerEnabled })}
                className="text-[10px] font-bold text-muted hover:text-fg"
              >
                {prefs.peekerEnabled ? "Hide" : "Show"}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {PEEKER_COMPANIONS.map((item) => {
                const selected = prefs.peekerEnabled && prefs.peekerId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseCompanion(item.id)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors",
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-line bg-surface-hover/40 hover:bg-surface-hover",
                    )}
                    title={item.alt}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt=""
                      decoding="async"
                      className="h-8 w-auto max-w-full object-contain"
                    />
                    <span className="truncate text-[10px] font-bold text-fg">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Auto-meme switch */}
          <div className="mt-2 border-t border-line pt-2">
            <VibeSwitch
              label="Auto typing memes"
              hint="Pops on bruh, cooked, wasted, rip, crash…"
              checked={prefs.memesEnabled}
              onChange={(checked) => updatePrefs({ memesEnabled: checked })}
            />
          </div>

          {/* Quick Live Theme strip */}
          {themeCtx && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="mb-1.5 px-0.5 text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                Quick Live Themes
              </p>
              <div className="grid grid-cols-3 gap-1">
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
                        "group relative h-11 overflow-hidden rounded-lg border text-left transition-[border-color,transform] active:scale-95",
                        active ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/40" : "border-line",
                      )}
                      title={palette.name}
                    >
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          decoding="async"
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
                        <span className="absolute top-1 right-1 grid size-3.5 place-items-center rounded-full bg-white text-black">
                          <Check weight="bold" className="size-2" aria-hidden />
                        </span>
                      )}
                      <span className="absolute inset-x-1 bottom-0.5 truncate text-[9px] font-extrabold text-white">
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
      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-surface-hover"
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
