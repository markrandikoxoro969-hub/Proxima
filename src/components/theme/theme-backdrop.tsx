"use client";

import { useTheme } from "@/components/theme/theme-provider";

/**
 * The painted background behind the scene themes.
 *
 * Rules it follows (see README → Themes):
 * - **Procedural only.** Three layers of CSS gradients. No images, no canvas, no
 *   video, so there is nothing to license, nothing to download and no 500 KB of
 *   WebM on a phone.
 * - **Cheap on the GPU.** The continuous layers move with `transform` and `opacity`
 *   only. There is one small, one-shot 400ms blur on the cross-fade (not on scroll).
 * - **Graded fallbacks.** `html[data-fx="static"]` (≤4 cores, or reduced motion)
 *   freezes the layers into a still gradient; phones drop the far layer.
 * - **One 400 ms cross-fade** with a small blur when the theme changes, because
 *   the whole block is re-keyed by the palette id.
 */
export function ThemeBackdrop() {
  const { theme } = useTheme();
  const scene = theme.scene;
  if (!scene) return null;

  return (
    <div key={theme.id} className="theme-backdrop" data-scene={scene} aria-hidden>
      <span className="tb-base" />
      <span className="tb-glow" />
      <span className="tb-detail" />
      <span className="tb-far" />
    </div>
  );
}
