"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import {
  getThemeAudioSnapshot,
  isThemeAudioDucked,
  isThemeAudioMuffled,
  setThemeAudioBlocked,
  subscribeThemeAudioEffects,
} from "@/lib/theme/use-theme-audio";
import {
  ensureVideoAudioGraph,
  getVideoAudioGraph,
  resolveAudioMix,
  type AudioMixState,
} from "@/lib/theme/video-audio-graph";
import type { AmbientController, AmbientKind } from "@/lib/theme/ambient-sound";

function ambientKindFor(themeId: string, scene?: string): AmbientKind | null {
  if (themeId === "night-drive" || themeId === "rose-gaze") return "night-drive";
  if (scene === "ocean" || scene === "sky" || scene === "nature") return scene;
  return null;
}

function readCurrentMix(immediate = false): AudioMixState {
  const { enabled, volume } = getThemeAudioSnapshot();
  return {
    enabled,
    volume,
    muffled: isThemeAudioMuffled(),
    ducked: isThemeAudioDucked(),
    immediate,
  };
}

/**
 * Hardware-composited ambient backdrop & zero-glitch audio engine.
 *
 * Key engineering invariants:
 * 1. ONE persistent `<video>` element across all theme switches — never unmounts
 *    or leaks zombie decoders/audio streams when changing themes.
 * 2. Instant hard-cut on mute or theme switch (`silenceNow()` + `video.muted = true`
 *    + `stopAllAmbientSounds()`) so sound NEVER lingers when cut.
 * 3. Web Audio low-pass filter (`~460 Hz`) + dimmed gain when Settings, dialogs,
 *    or overlays are open, and gentle voice ducking while Proxima speaks aloud.
 * 4. Poster sits underneath while a new video buffers; `<video>` fades in smoothly
 *    once the first frame is ready (zero black flash or freeze glitch).
 * 5. Audio state changes sync imperatively without forcing React re-renders.
 */
export function ThemeBackdrop() {
  const { theme } = useTheme();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [readySrc, setReadySrc] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientRef = useRef<AmbientController | null>(null);
  const ambientModuleRef = useRef<typeof import("@/lib/theme/ambient-sound") | null>(null);
  const switchTokenRef = useRef(0);
  const activeVideoSrcRef = useRef<string | null>(null);
  const activeAmbientRef = useRef<AmbientKind | null>(null);
  const unlockCleanupRef = useRef<(() => void) | null>(null);

  const media = theme.media;
  const scene = theme.scene;
  const isVideoTheme = media?.kind === "video" && !reducedMotion;
  const videoSrc = isVideoTheme ? media.src : null;
  const ambientKind = isVideoTheme ? null : ambientKindFor(theme.id, scene);
  const videoReady = Boolean(videoSrc && readySrc === videoSrc);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(mq.matches);
    syncMotion();
    mq.addEventListener("change", syncMotion);
    return () => mq.removeEventListener("change", syncMotion);
  }, []);

  // Keep refs updated for imperative event callbacks (zero React re-render overhead).
  useEffect(() => {
    activeVideoSrcRef.current = videoSrc;
    activeAmbientRef.current = ambientKind;
  }, [videoSrc, ambientKind]);

  // ── Imperative helpers ─────────────────────────────────────────────────
  const detachUnlock = () => {
    unlockCleanupRef.current?.();
    unlockCleanupRef.current = null;
  };

  const stopAmbientNow = () => {
    const prev = ambientRef.current;
    ambientRef.current = null;
    prev?.stop();
    ambientModuleRef.current?.stopAllAmbientSounds();
  };

  const releaseVideoNow = (video: HTMLVideoElement | null) => {
    if (!video) return;
    getVideoAudioGraph(video)?.silenceNow();
    video.pause();
    video.muted = true;
    if (video.getAttribute("src")) {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* jsdom */
      }
    }
  };

  // ── Master audio/video switch effect (runs ONLY when theme source changes) ──
  useEffect(() => {
    const token = ++switchTokenRef.current;
    const video = videoRef.current;

    detachUnlock();

    const attachUnlockOnce = (unlockAction: () => void) => {
      detachUnlock();
      const onGesture = (event: Event) => {
        // Never race with the user clicking the mute/volume controls directly.
        const target = event.target as HTMLElement | null;
        if (target?.closest?.("[data-theme-audio-control]")) return;
        if (!getThemeAudioSnapshot().enabled || document.hidden) return;
        detachUnlock();
        unlockAction();
      };
      window.addEventListener("pointerdown", onGesture, { passive: true });
      window.addEventListener("keydown", onGesture, { passive: true });
      unlockCleanupRef.current = () => {
        window.removeEventListener("pointerdown", onGesture);
        window.removeEventListener("keydown", onGesture);
      };
    };

    const applyVideoAudio = async (el: HTMLVideoElement, immediate = false) => {
      if (switchTokenRef.current !== token) return;
      const mix = readCurrentMix(immediate);

      if (!mix.enabled || document.hidden) {
        getVideoAudioGraph(el)?.silenceNow();
        el.muted = true;
        setThemeAudioBlocked(false);
        detachUnlock();
        return;
      }

      // Try Web Audio low-pass + gain graph (supports smooth covered/muffled mode).
      const graph = await ensureVideoAudioGraph(el);
      if (switchTokenRef.current !== token) return;
      const latestMix = readCurrentMix(immediate);
      if (!latestMix.enabled || document.hidden) {
        graph?.silenceNow();
        el.muted = true;
        return;
      }

      if (graph) {
        graph.apply(latestMix);
        if (el.paused) {
          try {
            await el.play();
          } catch {
            if (switchTokenRef.current !== token) return;
            graph.silenceNow();
            el.muted = true;
            setThemeAudioBlocked(true);
            attachUnlockOnce(() => void applyVideoAudio(el, false));
            return;
          }
        }
        if (switchTokenRef.current === token) setThemeAudioBlocked(false);
        return;
      }

      // Fallback when AudioContext is blocked before user gesture (or unavailable):
      const resolved = resolveAudioMix(latestMix);
      el.volume = resolved.gain;
      el.muted = false;
      try {
        await el.play();
        if (switchTokenRef.current === token) setThemeAudioBlocked(false);
      } catch {
        if (switchTokenRef.current !== token) return;
        // Keep video playing smoothly muted until first gesture unlocks audio.
        el.muted = true;
        setThemeAudioBlocked(true);
        try {
          await el.play();
        } catch {
          /* poster remains visible */
        }
        attachUnlockOnce(() => void applyVideoAudio(el, false));
      }
    };

    const startAmbient = async (kind: AmbientKind) => {
      if (switchTokenRef.current !== token) return;
      const mix = readCurrentMix(false);
      if (!mix.enabled || document.hidden) {
        stopAmbientNow();
        setThemeAudioBlocked(false);
        detachUnlock();
        return;
      }
      if (ambientRef.current && ambientRef.current.kind === kind) {
        ambientRef.current.applyMix(mix);
        setThemeAudioBlocked(false);
        return;
      }

      const mod = ambientModuleRef.current ?? (await import("@/lib/theme/ambient-sound"));
      ambientModuleRef.current = mod;
      if (switchTokenRef.current !== token) return;

      const latestMix = readCurrentMix(false);
      if (!latestMix.enabled || document.hidden) {
        stopAmbientNow();
        return;
      }

      const ctrl = await mod.startAmbientSound(kind, latestMix);
      if (switchTokenRef.current !== token) {
        ctrl?.stop();
        return;
      }
      if (ctrl) {
        ambientRef.current = ctrl;
        setThemeAudioBlocked(false);
        detachUnlock();
      } else {
        setThemeAudioBlocked(true);
        attachUnlockOnce(() => void startAmbient(kind));
      }
    };

    const startVideo = async (el: HTMLVideoElement, src: string) => {
      // Immediately kill any previous ambient soundscape & old video audio.
      stopAmbientNow();
      getVideoAudioGraph(el)?.silenceNow();
      el.pause();
      el.muted = true;

      if (document.hidden || document.documentElement.getAttribute("data-fx") === "static") {
        return;
      }

      // Only reload the pipeline when switching to a different video file.
      if (el.getAttribute("src") !== src) {
        el.src = src;
        try {
          el.load();
        } catch {
          /* jsdom */
        }
      }

      // Start muted playback first so visual frames decode immediately without
      // stalling on autoplay checks, then seamlessly engage audio if enabled.
      try {
        await el.play();
      } catch {
        /* will retry on gesture */
      }
      if (switchTokenRef.current !== token) return;

      const mix = readCurrentMix(false);
      if (mix.enabled) {
        await applyVideoAudio(el, false);
      } else {
        setThemeAudioBlocked(false);
      }
    };

    // ── Dispatch based on current theme kind ─────────────────────────────
    if (videoSrc && video) {
      void startVideo(video, videoSrc);
    } else {
      releaseVideoNow(video);
      if (ambientKind) {
        void startAmbient(ambientKind);
      } else {
        stopAmbientNow();
        setThemeAudioBlocked(false);
      }
    }

    // ── Instant sync when user mutes, drags volume, or opens/closes Settings ──
    const onAudioChange = () => {
      if (switchTokenRef.current !== token) return;
      const mix = readCurrentMix(false);

      // Hard-cut immediately when muted: zero tail, zero race conditions.
      if (!mix.enabled) {
        detachUnlock();
        setThemeAudioBlocked(false);
        stopAmbientNow();
        if (video) {
          getVideoAudioGraph(video)?.silenceNow();
          video.muted = true;
        }
        return;
      }

      if (document.hidden) return;

      if (videoSrc && video) {
        const existingGraph = getVideoAudioGraph(video);
        if (existingGraph) {
          existingGraph.apply(mix);
          if (video.paused) {
            void video.play().catch(() => {});
          }
          setThemeAudioBlocked(false);
        } else {
          void applyVideoAudio(video, false);
        }
      } else if (ambientKind) {
        if (ambientRef.current && ambientRef.current.kind === ambientKind) {
          ambientRef.current.applyMix(mix);
        } else {
          void startAmbient(ambientKind);
        }
      }
    };

    const onVisibility = () => {
      if (switchTokenRef.current !== token) return;
      if (document.hidden) {
        detachUnlock();
        stopAmbientNow();
        if (video) {
          getVideoAudioGraph(video)?.silenceNow();
          video.pause();
          video.muted = true;
        }
        return;
      }
      if (videoSrc && video) {
        void startVideo(video, videoSrc);
      } else if (ambientKind) {
        void startAmbient(ambientKind);
      }
    };

    const unsubAudio = subscribeThemeAudioEffects(onAudioChange);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      // Invalidate any in-flight async play/import from this theme immediately.
      if (switchTokenRef.current === token) {
        switchTokenRef.current += 1;
      }
      unsubAudio();
      document.removeEventListener("visibilitychange", onVisibility);
      detachUnlock();
      stopAmbientNow();
      if (video) {
        getVideoAudioGraph(video)?.silenceNow();
        video.pause();
        video.muted = true;
      }
    };
  }, [videoSrc, ambientKind]);

  // Final hard cleanup if ThemeBackdrop itself ever unmounts.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      detachUnlock();
      stopAmbientNow();
      releaseVideoNow(video);
    };
  }, []);

  const targetOpacity = media?.opacity ?? (theme.mode === "dark" ? 0.42 : 0.36);
  // Convert media visibility (0–1) into a crisp scrim strength so the <video>
  // itself renders at opacity: 1 (enabling zero-copy hardware video overlays).
  const scrimCenter = Math.round(Math.min(76, Math.max(38, (1 - targetOpacity) * 95)));
  const scrimEdge = Math.round(Math.min(90, scrimCenter + 22));
  const objectPosition = media?.position ?? "50% 50%";
  const showPoster = Boolean(media && (!isVideoTheme || !videoReady));

  return (
    <>
      <div
        className="theme-backdrop theme-backdrop--media"
        data-scene={media ? "media" : undefined}
        data-theme-mode={theme.mode}
        style={
          {
            display: media ? "block" : "none",
            "--media-scrim-center": `${scrimCenter}%`,
            "--media-scrim-edge": `${scrimEdge}%`,
          } as React.CSSProperties
        }
        aria-hidden
      >
        {media && showPoster && (
          // Poster / photo base layer: hidden the instant HD video is playing so
          // browsers promote <video> to a zero-copy hardware overlay plane.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={media.poster ?? media.src}
            src={media.poster ?? media.src}
            alt=""
            decoding="async"
            className="tb-media-el"
            style={{ objectPosition }}
          />
        )}
        <video
          ref={videoRef}
          className="tb-media-el tb-media-video"
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          onLoadedData={(e) => {
            const current = e.currentTarget.getAttribute("src");
            if (current && current === activeVideoSrcRef.current) {
              setReadySrc(current);
            }
          }}
          onPlaying={(e) => {
            const current = e.currentTarget.getAttribute("src");
            if (current && current === activeVideoSrcRef.current) {
              setReadySrc(current);
            }
          }}
          style={{
            display: isVideoTheme ? "block" : "none",
            objectPosition,
            opacity: isVideoTheme && videoReady ? 1 : 0,
          }}
        />
        {media && <span className="tb-media-scrim" />}
      </div>

      {!media && scene && scene !== "media" ? (
        <div key={theme.id} className="theme-backdrop" data-scene={scene} aria-hidden>
          <span className="tb-base" />
          <span className="tb-glow" />
          <span className="tb-detail" />
          <span className="tb-far" />
        </div>
      ) : null}
    </>
  );
}
