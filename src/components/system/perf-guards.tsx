"use client";

import { useEffect } from "react";

/**
 * Two tiny global guards that cost nothing and fix real jank:
 *
 * 1. A hidden tab must not keep animating. `html[data-hidden="true"]` pauses
 *    every CSS animation (see globals.css), so a background tab stops burning
 *    battery and the first frame back is not a burst of catch-up work.
 * 2. Low-power devices get the calm version of the scene themes: `data-fx="static"`
 *    turns the drifting layers into a still gradient (CSS only, no JS per frame).
 *
 * It deliberately does not use React state: nothing here should ever re-render.
 */
export function PerfGuards() {
  useEffect(() => {
    const root = document.documentElement;

    const syncVisibility = () => {
      root.dataset.hidden = document.hidden ? "true" : "false";
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    const cores = navigator.hardwareConcurrency ?? 8;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncFx = () => {
      root.dataset.fx = reduced.matches || cores <= 4 ? "static" : "full";
    };
    syncFx();
    reduced.addEventListener("change", syncFx);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      reduced.removeEventListener("change", syncFx);
    };
  }, []);

  return null;
}
