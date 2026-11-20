"use client";

import type Lenis from "lenis";
import { useEffect, useRef, useState } from "react";

/**
 * Landing page pointer + reveal behaviour. Sections stay server-rendered and
 * mark elements with data attributes:
 *
 *   data-reveal      → blur/fade in when scrolled into view (still CSS)
 *   .spotlight       → card glow that follows the mouse (desktop)
 *   data-header      → gets data-scrolled after you scroll a bit
 *
 * Motion-driven effects (parallax, velocity blur) live in ./scroll-fx.tsx and
 * magnetic buttons in ./magnetic.tsx — this file only does what motion values
 * can't: IntersectionObserver, the custom cursor and smooth scrolling.
 */
export function LandingEffects() {
  const [cursor, setCursor] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    // Low-core machines (cheap laptops, old tablets) skip the expensive extras:
    // smooth scrolling and the trailing cursor ring both cost a frame budget.
    const cores = navigator.hardwareConcurrency ?? 8;
    const capable = cores > 4;
    const rich = desktop && !reduced && capable;
    const cleanups: (() => void)[] = [];

    // 1) Scroll reveals ------------------------------------------------------
    const revealTargets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!reduced && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute("data-revealed", "");
            io.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0 },
      );
      revealTargets.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    } else {
      revealTargets.forEach((el) => el.setAttribute("data-revealed", ""));
    }

    // 2) Header state (one rAF-throttled scroll handler) ----------------------
    const header = document.querySelector<HTMLElement>("[data-header]");
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        header?.toggleAttribute("data-scrolled", window.scrollY > 8);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    if (!rich) return () => cleanups.forEach((fn) => fn());

    // 3) Smooth scrolling (Lenis) — desktop only -----------------------------
    // Lenis is downloaded only here, so phones never pay for it.
    let lenis: Lenis | null = null;
    let disposed = false;
    void import("lenis").then(({ default: LenisClass }) => {
      if (disposed) return;
      lenis = new LenisClass({
        autoRaf: true,
        // Snappier than the default 0.1: smooth, but the page keeps up with the wheel.
        lerp: 0.16,
        anchors: { offset: -88 },
        stopInertiaOnNavigate: true,
      });
    });
    cleanups.push(() => {
      disposed = true;
      lenis?.destroy();
    });

    // 4) Card spotlight (one delegated listener) ------------------------------
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const target = e.target instanceof Element ? e.target : null;
      const card = target?.closest<HTMLElement>(".spotlight");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${Math.round(e.clientX - r.left)}px`);
      card.style.setProperty("--my", `${Math.round(e.clientY - r.top)}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    cleanups.push(() => document.removeEventListener("pointermove", onMove));

    // 5) Custom cursor (rendered below)
    const showCursor = requestAnimationFrame(() => setCursor(true));
    cleanups.push(() => cancelAnimationFrame(showCursor));

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return cursor ? <Cursor /> : null;
}

const INTERACTIVE = "a, button, summary, label, select, [role='button'], [data-cursor]";
const TEXT = "input, textarea, [contenteditable='true']";

/**
 * Dot follows the mouse exactly; the ring trails softly.
 *
 * Everything is batched into one rAF frame: the old version toggled four
 * attributes and wrote two transforms on *every* pointermove, which forced a
 * style recalculation per mouse event and made the cursor feel heavy. It also
 * kept `cursor: none` on the document after the window lost focus (alt-tab,
 * a native dialog, a browser menu), which is what left the pointer "stuck".
 */
function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    const root = document.documentElement;

    let x = 0;
    let y = 0;
    let rx = 0;
    let ry = 0;
    let frame: number | null = null;
    let visible = false;
    let hover = false;
    let text = false;
    let down = false;

    const paint = () => {
      frame = null;
      if (!visible) return;
      rx += (x - rx) * 0.22;
      ry += (y - ry) * 0.22;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      if (Math.abs(x - rx) + Math.abs(y - ry) > 0.2) frame = requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    const setState = (el: HTMLElement, name: string, on: boolean) => {
      if (el.hasAttribute(name) !== on) el.toggleAttribute(name, on);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        rx = x;
        ry = y;
        // Hide the system cursor only after ours is on screen.
        root.classList.add("has-cursor");
        setState(dot, "data-visible", true);
        setState(ring, "data-visible", true);
      }
      const target = e.target instanceof Element ? e.target : null;
      const nextText = Boolean(target?.closest(TEXT));
      const nextHover = !nextText && Boolean(target?.closest(INTERACTIVE));
      if (nextText !== text) {
        text = nextText;
        setState(dot, "data-text", text);
        setState(ring, "data-text", text);
      }
      if (nextHover !== hover) {
        hover = nextHover;
        setState(dot, "data-hover", hover);
        setState(ring, "data-hover", hover);
      }
      schedule();
    };

    const onDown = () => {
      if (!down) {
        down = true;
        setState(ring, "data-down", true);
      }
    };
    const onUp = () => {
      if (down) {
        down = false;
        setState(ring, "data-down", false);
      }
    };

    /** Give the real pointer back whenever we can't be sure where it is. */
    const hide = () => {
      visible = false;
      hover = false;
      text = false;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      root.classList.remove("has-cursor");
      for (const el of [dot, ring]) {
        for (const name of ["data-visible", "data-hover", "data-text", "data-down"]) el.removeAttribute(name);
      }
    };

    const onVisibility = () => {
      if (document.hidden) hide();
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", hide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", hide);
    // Scrolls triggered by the wheel keep the pointer over new content; the ring
    // stays put visually but must not go stale after a jump (anchor links).
    window.addEventListener("scroll", schedule, { passive: true });
    root.addEventListener("pointerleave", hide);

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", hide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", schedule);
      root.removeEventListener("pointerleave", hide);
      hide();
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden />
      <div ref={dotRef} className="cursor-dot" aria-hidden />
    </>
  );
}
