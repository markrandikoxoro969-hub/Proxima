"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mounts its children only when they come close to the screen.
 *
 * The landing page should be usable the instant the hero paints. Sections far
 * below it (the live demo is two screens down) don't need their JavaScript,
 * state or event listeners until someone actually scrolls there.
 *
 * The reserved height keeps the scrollbar and the page layout stable. If
 * IntersectionObserver is missing, the content mounts immediately.
 */
export function LazyMount({
  children,
  /** Start this far before the section enters the screen. */
  rootMargin = "500px 0px",
  /** Space kept free while waiting, so nothing jumps when it mounts. */
  minHeight = 420,
}: {
  children: React.ReactNode;
  rootMargin?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, shown]);

  return (
    <div ref={ref} style={shown ? undefined : { minHeight }} aria-live="off">
      {shown ? children : null}
    </div>
  );
}
