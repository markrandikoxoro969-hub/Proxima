"use client";

import { useEffect, useState } from "react";

/**
 * Wraps every page and re-mounts on navigation, so each page enters with a
 * short blur → sharp fade (CSS only; see .page-in in globals.css).
 *
 * The very first page load is NOT faded: the hero has its own reveal, and
 * starting the whole page invisible would delay the first paint (worse LCP).
 */
let hasNavigated = false;

export default function Template({ children }: { children: React.ReactNode }) {
  // Read once on mount: false on the first load (matches the server HTML), true afterwards.
  const [animate] = useState(() => hasNavigated);
  useEffect(() => {
    hasNavigated = true;
  }, []);
  return <div className={animate ? "page-in" : undefined}>{children}</div>;
}
