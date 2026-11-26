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

type ViewportMode = "pending" | "desktop" | "mobile";

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
 * Hardware-composited ambient backdrop & zero-glitch decoupled audio engine.
 *
 * Key engineering invariants:
 * 1. **100% Decoupled Video & Audio**:
 *    - Desktop `<video>` plays pure video-only silent `.mp4` streams and is
 *      NEVER attached to `AudioContext` / `createMediaElementSource` — keeping
 *      hardware decode + GPU overlay completely stall-free.
 *    - A separate persistent `<audio>` plays each theme's lightweight `.m4a`
 *      soundtrack through our Web Audio low-pass muffle graph (`~460 Hz` when
 *      Settings or dialogs open, ducked when voice reads aloud, instant mute).
 * 2. **Zero-Lag Mobile Animated WebP Mode**:
 *    - On phones & coarse-pointer touch screens (`(max-width: 767px), (pointer: coarse)`),
 *      renders compact 10–12fps Animated WebP loops (`-mobile.webp`) instead of
 *      `<video>` — zero MediaCodec overhead, zero MP4 download, and still paired
 *      with the theme's `.m4a` audio track + muffled Settings filter!
 * 3. **Single-Layer Compositing**:
 *    - Applies `opacity` directly on the single active backdrop element over
 *      solid `var(--bg)` (no redundant full-viewport scrim overlay layer).
 * 4. **Instant Hard-Cut Audio**:
 *    - Muting, backgrounding, or switching themes immediately silences `<audio>`
 *      and stops ambient soundscapes with zero lingering tail.
 */
export function ThemeBackdrop() {
  const { theme } = useTheme();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("pending");
  const [readyVideoSrc, setReadyVideoSrc] = useState<string | null>(null);
  const [readyMobileSrc, setReadyMobileSrc] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ambientRef = useRef<AmbientController | null>(null);
  const ambientModuleRef = useRef<typeof import("@/lib/theme/ambient-sound") | null>(null);
  const switchTokenRef = useRef(0);
  const activeVideoSrcRef = useRef<string | null>(null);
  const unlockCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileMq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const syncMotion = () => setReducedMotion(motionMq.matches);
    const syncViewport = () => setViewportMode(mobileMq.matches ? "mobile" : "desktop");
    syncMotion();
    syncViewport();
    motionMq.addEventListener("change", syncMotion);
    mobileMq.addEventListener("change", syncViewport);
    return () => {
      motionMq.removeEventListener("change", syncMotion);
      mobileMq.removeEventListener("change", syncViewport);
    };
  }, []);

  const media = theme.media;
  const scene = theme.scene;
  const isMotionTheme = media?.kind === "video" && !reducedMotion;
  // On mobile phones, serve the lightweight Animated WebP loop (modern GIF) instead of <video>.
  const mobileLoopSrc =
    isMotionTheme && viewportMode === "mobile" && media.mobileSrc ? media.mobileSrc : null;
  // On desktop, play the pure silent video-only MP4 (never loaded on mobile or before viewport resolves).
  const videoSrc =
    isMotionTheme && (viewportMode === "desktop" || (viewportMode === "mobile" && !media.mobileSrc))
      ? media.src
      : null;
  // Standalone .m4a soundtrack works identically for BOTH desktop MP4 and mobile Animated WebP.
  const audioSrc = media?.kind === "video" ? (media.audioSrc ?? null) : null;
  const ambientKind = audioSrc ? null : ambientKindFor(theme.id, scene);

  const videoReady = Boolean(videoSrc && readyVideoSrc === videoSrc);
  const mobileReady = Boolean(mobileLoopSrc && readyMobileSrc === mobileLoopSrc);

  useEffect(() => {
    activeVideoSrcRef.current = videoSrc;
  }, [videoSrc]);

  // ── Imperative cleanup helpers ─────────────────────────────────────────
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

  const releaseAudioNow = (audio: HTMLAudioElement | null) => {
    if (!audio) return;
    getVideoAudioGraph(audio)?.silenceNow();
    audio.pause();
    audio.muted = true;
    if (audio.getAttribute("src")) {
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        /* jsdom */
      }
    }
  };

  // ── Pure silent desktop `<video>` lifecycle (ZERO AudioContext attachment!) ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!videoSrc) {
      releaseVideoNow(video);
      return;
    }

    const playVideo = () => {
      if (document.hidden || document.documentElement.getAttribute("data-fx") === "static") {
        video.pause();
        return;
      }
      video.muted = true;
      if (video.getAttribute("src") !== videoSrc) {
        video.src = videoSrc;
        try {
          video.load();
        } catch {
          /* jsdom */
        }
      }
      void video.play().catch(() => {
        /* poster remains visible */
      });
    };

    playVideo();

    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
      } else {
        playVideo();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
    };
  }, [videoSrc]);

  // ── Decoupled theme audio & ambient soundscape engine ──────────────────
  useEffect(() => {
    const token = ++switchTokenRef.current;
    const audio = audioRef.current;

    detachUnlock();

    const attachUnlockOnce = (unlockAction: () => void) => {
      detachUnlock();
      const onGesture = (event: Event) => {
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

    const startTrackAudio = async (el: HTMLAudioElement, src: string, immediate = false) => {
      if (switchTokenRef.current !== token) return;
      stopAmbientNow();

      const mix = readCurrentMix(immediate);
      if (!mix.enabled || document.hidden) {
        getVideoAudioGraph(el)?.silenceNow();
        el.pause();
        el.muted = true;
        setThemeAudioBlocked(false);
        detachUnlock();
        return;
      }

      if (el.getAttribute("src") !== src) {
        getVideoAudioGraph(el)?.silenceNow();
        el.pause();
        el.src = src;
        try {
          el.load();
        } catch {
          /* jsdom */
        }
      }

      // Route ONLY the standalone `<audio>` element through Web Audio low-pass + gain.
      const graph = await ensureVideoAudioGraph(el);
      if (switchTokenRef.current !== token) return;
      const latestMix = readCurrentMix(immediate);
      if (!latestMix.enabled || document.hidden) {
        graph?.silenceNow();
        el.pause();
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
            attachUnlockOnce(() => void startTrackAudio(el, src, false));
            return;
          }
        }
        if (switchTokenRef.current === token) setThemeAudioBlocked(false);
        return;
      }

      // Fallback before user gesture unlocks AudioContext:
      const resolved = resolveAudioMix(latestMix);
      el.volume = resolved.gain;
      el.muted = false;
      try {
        await el.play();
        if (switchTokenRef.current === token) setThemeAudioBlocked(false);
      } catch {
        if (switchTokenRef.current !== token) return;
        el.pause();
        el.muted = true;
        setThemeAudioBlocked(true);
        attachUnlockOnce(() => void startTrackAudio(el, src, false));
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

    if (audioSrc && audio) {
      void startTrackAudio(audio, audioSrc, false);
    } else {
      releaseAudioNow(audio);
      if (ambientKind) {
        void startAmbient(ambientKind);
      } else {
        stopAmbientNow();
        setThemeAudioBlocked(false);
      }
    }

    const onAudioChange = () => {
      if (switchTokenRef.current !== token) return;
      const mix = readCurrentMix(false);

      if (!mix.enabled) {
        detachUnlock();
        setThemeAudioBlocked(false);
        stopAmbientNow();
        if (audio) {
          getVideoAudioGraph(audio)?.silenceNow();
          audio.pause();
          audio.muted = true;
        }
        return;
      }

      if (document.hidden) return;

      if (audioSrc && audio) {
        const existingGraph = getVideoAudioGraph(audio);
        if (existingGraph && audio.getAttribute("src") === audioSrc) {
          existingGraph.apply(mix);
          if (audio.paused) {
            void audio.play().catch(() => {});
          }
          setThemeAudioBlocked(false);
        } else {
          void startTrackAudio(audio, audioSrc, false);
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
        if (audio) {
          getVideoAudioGraph(audio)?.silenceNow();
          audio.pause();
          audio.muted = true;
        }
        return;
      }
      if (audioSrc && audio) {
        void startTrackAudio(audio, audioSrc, false);
      } else if (ambientKind) {
        void startAmbient(ambientKind);
      }
    };

    const unsubAudio = subscribeThemeAudioEffects(onAudioChange);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (switchTokenRef.current === token) {
        switchTokenRef.current += 1;
      }
      unsubAudio();
      document.removeEventListener("visibilitychange", onVisibility);
      detachUnlock();
      stopAmbientNow();
      if (audio) {
        getVideoAudioGraph(audio)?.silenceNow();
        audio.pause();
        audio.muted = true;
      }
    };
  }, [audioSrc, ambientKind]);

  // Final hard cleanup if ThemeBackdrop ever unmounts.
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    return () => {
      detachUnlock();
      stopAmbientNow();
      releaseVideoNow(video);
      releaseAudioNow(audio);
    };
  }, []);

  const targetOpacity = media?.opacity ?? (theme.mode === "dark" ? 0.42 : 0.36);
  const objectPosition = media?.position ?? "50% 50%";
  const showPoster = Boolean(media && !videoReady && !mobileReady);

  return (
    <>
      <div
        className="theme-backdrop theme-backdrop--media"
        data-scene={media ? "media" : undefined}
        data-theme-mode={theme.mode}
        style={{ display: media ? "block" : "none" }}
        aria-hidden
      >
        {media && showPoster && (
          // Instant still poster / photo layer: hidden as soon as the live
          // video or mobile animated WebP is ready so only ONE layer composites.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={media.poster ?? media.src}
            src={media.poster ?? media.src}
            alt=""
            decoding="async"
            className="tb-media-el"
            style={{ objectPosition, opacity: targetOpacity }}
          />
        )}

        {mobileLoopSrc && (
          // Mobile phones: compact 10–12fps Animated WebP loop (modern 24-bit GIF)
          // — zero <video> MediaCodec contention or mobile scroll lag.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={mobileLoopSrc}
            src={mobileLoopSrc}
            alt=""
            decoding="async"
            className="tb-media-el"
            onLoad={() => setReadyMobileSrc(mobileLoopSrc)}
            style={{
              objectPosition,
              opacity: mobileReady ? targetOpacity : 0,
            }}
          />
        )}

        <video
          ref={videoRef}
          className="tb-media-el tb-media-video"
          loop
          muted
          playsInline
          preload={videoSrc ? "auto" : "none"}
          disablePictureInPicture
          disableRemotePlayback
          onLoadedData={(e) => {
            const current = e.currentTarget.getAttribute("src");
            if (current && current === activeVideoSrcRef.current) {
              setReadyVideoSrc(current);
            }
          }}
          onPlaying={(e) => {
            const current = e.currentTarget.getAttribute("src");
            if (current && current === activeVideoSrcRef.current) {
              setReadyVideoSrc(current);
            }
          }}
          style={{
            display: videoSrc ? "block" : "none",
            objectPosition,
            opacity: videoReady ? targetOpacity : 0,
          }}
        />

        {/* Standalone persistent audio element: decoupled from <video> so hardware video decode never stalls. */}
        <audio ref={audioRef} loop preload="none" />
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
