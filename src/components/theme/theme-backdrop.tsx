"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";

/**
 * The ambient background behind scene & aesthetic media themes.
 *
 * - Procedural scenes (`sky`, `ocean`, `nature`): four layers of pure CSS
 *   gradients moved with transform/opacity only.
 * - Aesthetic media themes: a full-bleed silent video loop or softly drifting
 *   photo behind a readability scrim tinted with the theme's background colour.
 * - Respects `prefers-reduced-motion` and pauses video playback while hidden.
 */
export function ThemeBackdrop() {
  const { theme } = useTheme();
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const media = theme.media;
  const scene = theme.scene;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(mq.matches);
    syncMotion();
    mq.addEventListener("change", syncMotion);
    return () => mq.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    if (media?.kind !== "video" || reducedMotion) return;
    const video = videoRef.current;
    if (!video) return;

    const syncPlayback = () => {
      if (document.hidden || document.documentElement.getAttribute("data-fx") === "static") {
        video.pause();
      } else {
        void video.play().catch(() => {
          /* autoplay blocked: poster still paints */
        });
      }
    };

    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      document.removeEventListener("visibilitychange", syncPlayback);
      video.pause();
    };
  }, [media?.kind, media?.src, reducedMotion]);

  if (media) {
    const mediaStyle = {
      objectPosition: media.position ?? "50% 50%",
      opacity: media.opacity ?? (theme.mode === "dark" ? 0.38 : 0.3),
    };

    return (
      <div
        key={theme.id}
        className="theme-backdrop theme-backdrop--media"
        data-scene="media"
        data-theme-mode={theme.mode}
        aria-hidden
      >
        {media.kind === "video" && !reducedMotion ? (
          <video
            ref={videoRef}
            className="tb-media-el"
            src={media.src}
            poster={media.poster}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            style={mediaStyle}
          />
        ) : (
          // Local static asset from /public/media/themes.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.poster ?? media.src}
            alt=""
            className={media.kind === "image" ? "tb-media-el tb-media-drift" : "tb-media-el"}
            style={mediaStyle}
          />
        )}
        <span className="tb-media-scrim" />
        <span className="tb-media-glow" />
        <span className="noise-layer" />
      </div>
    );
  }

  if (!scene || scene === "media") return null;

  return (
    <div key={theme.id} className="theme-backdrop" data-scene={scene} aria-hidden>
      <span className="tb-base" />
      <span className="tb-glow" />
      <span className="tb-detail" />
      <span className="tb-far" />
    </div>
  );
}
