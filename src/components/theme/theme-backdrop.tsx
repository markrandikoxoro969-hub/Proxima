"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import {
  isThemeAudioDucked,
  setThemeAudioBlocked,
  useThemeAudio,
} from "@/lib/theme/use-theme-audio";
import type { AmbientController, AmbientKind } from "@/lib/theme/ambient-sound";

function ambientKindFor(themeId: string, scene?: string): AmbientKind | null {
  if (themeId === "night-drive") return "night-drive";
  if (scene === "ocean" || scene === "sky" || scene === "nature") return scene;
  return null;
}

/**
 * Ambient background & sound engine for scene and aesthetic media themes.
 *
 * Performance rules for zero-lag live video themes:
 * - Zero CSS `filter`, zero SVG `feTurbulence`, zero live `backdrop-filter`
 *   blur over the video — lets the browser keep hardware zero-copy compositing.
 * - Videos are pre-encoded at 24fps, fastdecode, zero B-frames, with AAC audio.
 * - Pauses both video & audio when the tab is hidden or under reduced motion.
 */
export function ThemeBackdrop() {
  const { theme } = useTheme();
  const { enabled: audioEnabled, volume } = useThemeAudio();
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientRef = useRef<AmbientController | null>(null);
  const audioRef = useRef({ enabled: audioEnabled, volume });

  useEffect(() => {
    audioRef.current = { enabled: audioEnabled, volume };
  }, [audioEnabled, volume]);

  const media = theme.media;
  const scene = theme.scene;
  const ambientKind = media?.kind === "video" ? null : ambientKindFor(theme.id, scene);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(mq.matches);
    syncMotion();
    mq.addEventListener("change", syncMotion);
    return () => mq.removeEventListener("change", syncMotion);
  }, []);

  // ── Start / pause live video playback cleanly per video src ───────────
  useEffect(() => {
    if (media?.kind !== "video" || reducedMotion) {
      if (!ambientKind) setThemeAudioBlocked(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;

    const effectiveVolume = () => {
      const v = audioRef.current.volume;
      return isThemeAudioDucked() ? v * 0.2 : v;
    };

    const startPlayback = async () => {
      if (disposed) return;
      if (document.hidden || document.documentElement.getAttribute("data-fx") === "static") {
        video.pause();
        return;
      }

      const wantSound = audioRef.current.enabled;
      video.volume = effectiveVolume();
      video.muted = !wantSound;

      try {
        await video.play();
        if (!disposed) setThemeAudioBlocked(false);
      } catch {
        // Browser autoplay policy blocked unmuted playback before first gesture:
        // keep video playing smoothly muted and unlock audio on first tap/key.
        if (disposed) return;
        if (wantSound) {
          video.muted = true;
          setThemeAudioBlocked(true);
          try {
            await video.play();
          } catch {
            /* poster remains visible */
          }
        }
      }
    };

    void startPlayback();

    const onVisibility = () => {
      void startPlayback();
    };
    const onUnlock = () => {
      if (!audioRef.current.enabled || document.hidden) return;
      video.muted = false;
      video.volume = effectiveVolume();
      void video
        .play()
        .then(() => {
          if (!disposed) setThemeAudioBlocked(false);
        })
        .catch(() => {});
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onUnlock, { passive: true });
    window.addEventListener("keydown", onUnlock, { passive: true });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onUnlock);
      window.removeEventListener("keydown", onUnlock);
      video.pause();
    };
  }, [media?.kind, media?.src, reducedMotion, ambientKind]);

  // ── Live volume / mute / ducking sync without ever interrupting video ──
  useEffect(() => {
    if (media?.kind !== "video" || reducedMotion) return;
    const video = videoRef.current;
    if (!video) return;

    const syncLevels = () => {
      const targetVol = isThemeAudioDucked() ? volume * 0.2 : volume;
      video.volume = targetVol;
      video.muted = !audioEnabled;
      if (audioEnabled && video.paused && !document.hidden) {
        void video
          .play()
          .then(() => setThemeAudioBlocked(false))
          .catch(() => setThemeAudioBlocked(true));
      } else if (!audioEnabled) {
        setThemeAudioBlocked(false);
      }
    };

    syncLevels();
    window.addEventListener("proxima:theme-audio-change", syncLevels);
    return () => window.removeEventListener("proxima:theme-audio-change", syncLevels);
  }, [media?.kind, reducedMotion, audioEnabled, volume]);

  // ── Ambient Web Audio soundscape for photo & procedural scene themes ──
  useEffect(() => {
    if (!ambientKind || !audioEnabled) {
      ambientRef.current?.stop();
      ambientRef.current = null;
      if (media?.kind !== "video") setThemeAudioBlocked(false);
      return;
    }

    let cancelled = false;

    const start = async () => {
      if (cancelled || document.hidden) return;
      const { startAmbientSound } = await import("@/lib/theme/ambient-sound");
      if (cancelled || document.hidden) return;
      ambientRef.current?.stop();
      const vol = audioRef.current.volume;
      const ctrl = await startAmbientSound(ambientKind, isThemeAudioDucked() ? vol * 0.2 : vol);
      if (cancelled) {
        ctrl?.stop();
        return;
      }
      if (ctrl) {
        ambientRef.current = ctrl;
        setThemeAudioBlocked(false);
      } else {
        setThemeAudioBlocked(true);
      }
    };

    void start();

    const onVisibility = () => {
      if (document.hidden) {
        ambientRef.current?.stop();
        ambientRef.current = null;
      } else if (!ambientRef.current) {
        void start();
      }
    };
    const onUnlock = () => {
      if (!ambientRef.current && !document.hidden) void start();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onUnlock, { passive: true });
    window.addEventListener("keydown", onUnlock, { passive: true });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onUnlock);
      window.removeEventListener("keydown", onUnlock);
      ambientRef.current?.stop();
      ambientRef.current = null;
    };
  }, [ambientKind, audioEnabled, media?.kind]);

  // Smooth volume + ducking updates for active ambient soundscape
  useEffect(() => {
    const syncAmbient = () => {
      ambientRef.current?.setVolume(isThemeAudioDucked() ? volume * 0.2 : volume);
    };
    syncAmbient();
    window.addEventListener("proxima:theme-audio-change", syncAmbient);
    return () => window.removeEventListener("proxima:theme-audio-change", syncAmbient);
  }, [volume]);

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
            muted={!audioEnabled}
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
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
