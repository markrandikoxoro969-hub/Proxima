"use client";

import { useTheme } from "@/components/theme/theme-provider";

/**
 * The slow light behind scene themes (Sky, Ocean, Nature).
 *
 * Three fixed layers painted with CSS gradients only — no images, no canvas and
 * no `filter: blur()`, which are the three things that make a background like
 * this janky on a laptop. Each layer moves with `transform` + `opacity`, so the
 * browser can hand it to the compositor and forget about it.
 *
 * Mounted once in the root layout. A theme without a scene renders nothing, and
 * `prefers-reduced-motion` stops the movement entirely.
 */
export function ThemeBackdrop() {
  const { theme } = useTheme();
  const scene = theme.scene;
  if (!scene) return null;

  return (
    <div className="theme-backdrop" data-scene={scene} aria-hidden>
      <span className="tb-glow" />
      <span className="tb-haze" />
      <span className="tb-texture" />
    </div>
  );
}
