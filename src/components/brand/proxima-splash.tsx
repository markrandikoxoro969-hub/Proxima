"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LOGO_TEXT = "Proxima";
const TYPE_INTERVAL_MS = 90;
const HOLD_AFTER_TYPE_MS = 650;
const FADE_DURATION_MS = 400;

/**
 * Original Proxima launch sequence — refined to a compact, sleek proportion
 * matching the website vibe. Plays on every load/refresh and whenever the user
 * leaves the page/tab and returns (visibilitychange / bfcache pageshow).
 */
export function ProximaSplash() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [typed, setTyped] = useState("");
  const timersRef = useRef<{
    interval: ReturnType<typeof setInterval> | null;
    hold: ReturnType<typeof setTimeout> | null;
    hide: ReturnType<typeof setTimeout> | null;
  }>({ interval: null, hold: null, hide: null });
  const wasHiddenRef = useRef(false);

  const clearTimers = useCallback(() => {
    const t = timersRef.current;
    if (t.interval !== null) clearInterval(t.interval);
    if (t.hold !== null) clearTimeout(t.hold);
    if (t.hide !== null) clearTimeout(t.hide);
    t.interval = null;
    t.hold = null;
    t.hide = null;
  }, []);

  const playSequence = useCallback(() => {
    clearTimers();
    setVisible(true);
    setFading(false);
    setTyped("");

    let index = 0;
    timersRef.current.interval = setInterval(() => {
      index += 1;
      setTyped(LOGO_TEXT.slice(0, index));
      if (index >= LOGO_TEXT.length) {
        if (timersRef.current.interval !== null) {
          clearInterval(timersRef.current.interval);
          timersRef.current.interval = null;
        }
        timersRef.current.hold = setTimeout(() => {
          setFading(true);
          timersRef.current.hide = setTimeout(() => {
            setVisible(false);
          }, FADE_DURATION_MS);
        }, HOLD_AFTER_TYPE_MS);
      }
    }, TYPE_INTERVAL_MS);
  }, [clearTimers]);

  useEffect(() => {
    // Schedule initial launch sequence cleanly as an external timer subscription.
    const boot = setTimeout(() => {
      playSequence();
    }, 0);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
      } else if (document.visibilityState === "visible" && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        playSequence();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        wasHiddenRef.current = false;
        playSequence();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      clearTimeout(boot);
      clearTimers();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [clearTimers, playSequence]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Loading Proxima"
      aria-live="polite"
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg transition-opacity duration-400 ease-out dark:bg-black ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center justify-center">
        <div className="relative mb-5 flex size-20 items-center justify-center sm:size-24">
          <div className="absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full border border-fg/12" />
          <div className="absolute inset-1.5 animate-[spin_3s_linear_infinite_reverse] rounded-full border border-transparent border-t-fg" />
          {/* Inline Proxima Planet mark (matches Phosphor ph-fill ph-planet, zero extra bundle cost). */}
          <svg
            viewBox="0 0 256 256"
            className="proxima-logo-glow size-9 animate-pulse text-fg sm:size-10"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M236.74,64.86c-7-10.72-24.16-12.56-48.59-5.6a96.16,96.16,0,0,0-156,74.29C15.83,157.8,10.7,178.47,19.26,191.14c5.13,7.87,15.32,11.69,29,11.69a106.79,106.79,0,0,0,19.62-2.09,96.16,96.16,0,0,0,156-74.29C240.17,102.2,245.3,81.53,236.74,64.86ZM32.63,182.39c-3.17-4.86-1.15-14.43,5.32-25.67A95.88,95.88,0,0,0,58.88,185C45.33,187.84,35.63,187,32.63,182.39ZM218.05,99.28A95.88,95.88,0,0,0,197.12,71c13.55-2.85,23.25-2,26.25,2.61C226.54,78.47,224.52,88,218.05,99.28Z" />
          </svg>
        </div>
        <div className="h-7">
          <span className="proxima-text-glow font-sans text-lg font-extrabold tracking-[0.28em] text-fg sm:text-xl">
            {typed}
          </span>
          <span className="animate-pulse font-sans text-lg font-extrabold text-fg sm:text-xl" aria-hidden>
            _
          </span>
        </div>
      </div>
    </div>
  );
}
