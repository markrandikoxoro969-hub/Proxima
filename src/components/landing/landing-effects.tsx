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
    const rich = desktop && !reduced;
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
        lerp: 0.12,
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

/** Dot follows the mouse exactly; the ring trails softly. Transform-only. */
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

    const loop = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      frame = Math.abs(x - rx) + Math.abs(y - ry) > 0.2 ? requestAnimationFrame(loop) : null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        rx = x;
        ry = y;
        root.classList.add("has-cursor"); // hide the system cursor only once ours is showing
        dot.setAttribute("data-visible", "");
        ring.setAttribute("data-visible", "");
      }
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const target = e.target instanceof Element ? e.target : null;
      const onText = Boolean(target?.closest(TEXT));
      const onInteractive = !onText && Boolean(target?.closest(INTERACTIVE));
      dot.toggleAttribute("data-hover", onInteractive);
      ring.toggleAttribute("data-hover", onInteractive);
      dot.toggleAttribute("data-text", onText);
      ring.toggleAttribute("data-text", onText);
      if (frame === null) frame = requestAnimationFrame(loop);
    };
    const hide = () => {
      visible = false;
      root.classList.remove("has-cursor");
      dot.removeAttribute("data-visible");
      ring.removeAttribute("data-visible");
    };
    const down = () => ring.setAttribute("data-down", "");
    const up = () => ring.removeAttribute("data-down");

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    root.addEventListener("pointerleave", hide);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
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
