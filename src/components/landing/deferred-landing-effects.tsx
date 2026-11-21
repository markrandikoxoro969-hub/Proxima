"use client";

import { useEffect, useState } from "react";

type LandingEffectsComponent = typeof import("./landing-effects").LandingEffects;
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Keep optional pointer and reveal behavior out of the landing page's first-load bundle. */
export function DeferredLandingEffects() {
  const [Effects, setEffects] = useState<LandingEffectsComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void import("./landing-effects").then(({ LandingEffects }) => {
        if (!cancelled) setEffects(() => LandingEffects);
      });
    };
    const browser = window as IdleWindow;
    const idleHandle = browser.requestIdleCallback?.(load, { timeout: 1200 });
    const fallbackHandle = idleHandle === undefined ? window.setTimeout(load, 300) : undefined;

    return () => {
      cancelled = true;
      if (idleHandle !== undefined) browser.cancelIdleCallback?.(idleHandle);
      if (fallbackHandle !== undefined) window.clearTimeout(fallbackHandle);
    };
  }, []);

  return Effects ? <Effects /> : null;
}
