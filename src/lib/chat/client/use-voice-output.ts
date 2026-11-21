"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LIMITS } from "@/lib/limits";
import {
  VOICE_PROFILES,
  pickVoice,
  splitForSpeech,
  toSpeechText,
  type VoiceChoice,
  type VoiceEngine,
} from "./voice";

type SpeakOptions = {
  voice: VoiceChoice;
  speed?: number;
  /** "natural" asks /api/speech; "device" uses the browser's own engine. */
  engine?: VoiceEngine;
  /** Replaces the hook-level onEnd for this utterance (used by voice previews). */
  onDone?: () => void;
};

const noopSubscribe = () => () => {};
const canPlayAudio = () => typeof window !== "undefined" && typeof window.Audio === "function";
const canSpeakDevice = () => typeof window !== "undefined" && "speechSynthesis" in window;
const canSpeak = () => canPlayAudio() || canSpeakDevice();

/**
 * Replaying the same chunk should be instant and should not cost another API
 * call. Blobs live only in this tab (a few MB at most) and are never stored.
 */
const audioCache = new Map<string, Blob>();
const AUDIO_CACHE_MAX = 24;
/** A normal piece arrives in 1–3 s; never leave the listener in silence. */
const SPEECH_FETCH_TIMEOUT_MS = 10_000;

/**
 * A 50 ms silent WAV. Mobile browsers (iOS Safari especially) only allow
 * programmatic audio after a real user gesture. Playing this once, on the
 * first tap/keypress, unlocks the audio element we reuse for every reply.
 * (A Blob URL rather than a data: URL because our CSP allows blob: media.)
 */
const SILENT_WAV_BASE64 =
  "UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

function cacheKey(text: string, voice: VoiceChoice, speed: number) {
  return `${voice}|${speed}|${text}`;
}

async function requestSpeech(
  text: string,
  voice: VoiceChoice,
  speed: number,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (signal.aborted) return null;
  const key = cacheKey(text, voice, speed);
  const remembered = audioCache.get(key);
  if (remembered) return remembered;

  // A slow piece must not hold the whole reply hostage: abandon this request
  // after 10 s and let the caller fall back to the device voice.
  const local = new AbortController();
  const forwardAbort = () => local.abort();
  signal.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => local.abort(), SPEECH_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch("/api/speech", {
      method: "POST",
      signal: local.signal,
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("audio/")) return null;
    const blob = await response.blob();
    if (blob.size === 0) return null;

    audioCache.set(key, blob);
    if (audioCache.size > AUDIO_CACHE_MAX) {
      const oldest = audioCache.keys().next().value;
      if (oldest) audioCache.delete(oldest);
    }
    return blob;
  } catch {
    return null; // offline, aborted, timed out, or the route said no
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Speaks Proxima's answers with a real neural voice, falling back to the
 * browser's built-in voice whenever the natural one is unavailable.
 *
 * Why a hook instead of one `speak()` call:
 *  - long replies are split into sentence-sized pieces (limits, latency and
 *    smoother stop);
 *  - the next piece downloads while the current one plays;
 *  - cancelling/replacing a reply must not fire the previous reply's "finished"
 *    callback (the generation counter);
 *  - voices load asynchronously on Chrome, so we listen for `voiceschanged`.
 *
 * Natural audio is requested from our own server. The answer text is sent to
 * the chosen voice vendor to be spoken; it is not stored there by Proxima.
 */
export function useVoiceOutput({
  onEnd,
  onError,
}: {
  /** Called once when the last piece has finished speaking (not on stop). */
  onEnd?: () => void;
  onError?: (message: string) => void;
} = {}) {
  // The server can't know whether this browser can play audio; assume it can't.
  const supported = useSyncExternalStore(noopSubscribe, canSpeak, () => false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [activeEngine, setActiveEngine] = useState<VoiceEngine | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const generation = useRef(0);
  const alive = useRef(true);
  // ONE audio element for the whole page: mobile browsers unlock a specific
  // element during a gesture, so creating a new Audio() for each chunk would
  // put the first tap to waste.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const endRef = useRef(onEnd);
  const errorRef = useRef(onError);

  useEffect(() => {
    endRef.current = onEnd;
    errorRef.current = onError;
  });

  const ensureAudio = useCallback(() => {
    if (!canPlayAudio()) return null;
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.setAttribute("playsinline", "");
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  // Unlock playback on the first real gesture, before a reply needs it.
  useEffect(() => {
    if (!canPlayAudio()) return;
    let unlocked = false;
    let silentUrl: string | null = null;

    const removeListeners = () => {
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("click", unlock, { capture: true });
    };

    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      removeListeners();
      const audio = ensureAudio();
      if (!audio || !audio.paused) return; // never interrupt real speech
      try {
        const binary = atob(SILENT_WAV_BASE64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        silentUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        audio.src = silentUrl;
        void audio
          .play()
          .then(() => {
            if (audio.src === silentUrl) {
              audio.pause();
              audio.currentTime = 0;
            }
          })
          .catch(() => {
            /* the next real play() will report the failure honestly */
          });
      } catch {
        /* unlocking is best-effort */
      }
    };

    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("click", unlock, { capture: true });
    return () => {
      removeListeners();
      if (silentUrl) URL.revokeObjectURL(silentUrl);
    };
  }, [ensureAudio]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        try {
          audio.pause();
        } catch {
          /* already stopped */
        }
      }
      if (canSpeakDevice()) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!canSpeakDevice()) return;
    const load = () => {
      try {
        const list = window.speechSynthesis.getVoices();
        voicesRef.current = list;
        setVoices(list);
      } catch {
        /* a browser with a broken speech engine: the default voice still works */
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, []);

  const stopCurrent = useCallback(() => {
    generation.current++;
    requestRef.current?.abort();
    requestRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* already stopped */
      }
      // Keep the element: it is already unlocked on this phone.
    }
    if (canSpeakDevice()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    stopCurrent();
  }, [stopCurrent]);

  const speak = useCallback(
    (text: string, { voice, speed = 1, engine = "natural", onDone }: SpeakOptions) => {
      if (!canSpeak()) {
        errorRef.current?.(
          "This browser can't play spoken replies. Try Chrome, Edge or Safari for voice mode.",
        );
        return false;
      }

      let clean = toSpeechText(text);
      let truncated = false;
      if (clean.length > LIMITS.speechReplyMax) {
        clean = clean.slice(0, LIMITS.speechReplyMax);
        truncated = true;
      }
      const chunks = splitForSpeech(clean, LIMITS.speechChunkChars);
      if (chunks.length === 0) return false;
      if (truncated) chunks.push("The rest is on screen.");

      stopCurrent();
      const run = generation.current;
      const profile = VOICE_PROFILES[voice];

      setSpeaking(true);
      setActiveEngine(engine);

      const finish = () => {
        if (!alive.current || run !== generation.current) return;
        requestRef.current = null;
        setSpeaking(false);
        (onDone ?? endRef.current)?.();
      };

      const playBlob = (blob: Blob, signal: AbortSignal): Promise<boolean> =>
        new Promise((resolve) => {
          if (!canPlayAudio() || signal.aborted) {
            resolve(false);
            return;
          }
          const audio = ensureAudio();
          let url: string;
          try {
            if (!audio) throw new Error("No audio element");
            url = URL.createObjectURL(blob);
            audio.src = url;
            audio.load();
          } catch {
            resolve(false);
            return;
          }
          let settled = false;

          const cleanup = () => {
            signal.removeEventListener("abort", onAbort);
            audio.onended = null;
            audio.onerror = null;
            try {
              audio.pause();
            } catch {
              /* already stopped */
            }
            if (audio.src === url) audio.removeAttribute("src");
            URL.revokeObjectURL(url);
          };
          const settle = (ok: boolean) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(ok);
          };
          const onAbort = () => {
            try {
              audio.pause();
            } catch {
              /* already stopped */
            }
            settle(true);
          };

          signal.addEventListener("abort", onAbort, { once: true });
          audio.onended = () => settle(true);
          audio.onerror = () => settle(false);
          try {
            void audio.play().catch(() => settle(false));
          } catch {
            settle(false);
          }
        });

      const playNatural = async (signal: AbortSignal): Promise<{ ok: boolean; spoken: number }> => {
        let spoken = 0;
        // Fetch piece 1 now; while it plays, piece 2 downloads behind it.
        let next = requestSpeech(chunks[0]!, voice, speed, signal);
        for (let index = 0; index < chunks.length; index++) {
          if (!alive.current || run !== generation.current || signal.aborted) {
            return { ok: true, spoken };
          }
          const blob = await next;
          if (!alive.current || run !== generation.current || signal.aborted) {
            return { ok: true, spoken };
          }
          if (!blob) return { ok: false, spoken };
          if (index + 1 < chunks.length) {
            next = requestSpeech(chunks[index + 1]!, voice, speed, signal);
          }
          const played = await playBlob(blob, signal);
          if (!alive.current || run !== generation.current || signal.aborted) {
            return { ok: true, spoken };
          }
          if (!played) return { ok: false, spoken };
          spoken++;
        }
        finish();
        return { ok: true, spoken };
      };

      const playDevice = (parts: string[] = chunks): boolean => {
        if (!canSpeakDevice() || parts.length === 0) return false;
        const lang = document.documentElement.lang || "en-US";
        const picked = pickVoice(voicesRef.current, voice, lang);
        let spokenDevice = 0;
        try {
          for (const chunk of parts) {
            const utterance = new SpeechSynthesisUtterance(chunk);
            if (picked) utterance.voice = picked;
            // Replies are in the page's language; the device locale might be Nepali.
            utterance.lang = picked?.lang || lang;
            utterance.pitch = profile.pitch;
            utterance.rate = Math.min(2, Math.max(0.5, speed));
            utterance.onend = () => {
              if (!alive.current || run !== generation.current) return;
              spokenDevice++;
              if (spokenDevice < parts.length) return;
              finish();
            };
            utterance.onerror = (event) => {
              if (!alive.current || run !== generation.current) return;
              // A replaced/stopped reply is expected, not an error to show.
              if (event.error === "interrupted" || event.error === "canceled") return;
              generation.current++;
              window.speechSynthesis.cancel();
              setSpeaking(false);
              errorRef.current?.(
                event.error === "not-allowed"
                  ? "Your browser blocked speech. Allow sound for this site and try again."
                  : "This device couldn't play the voice. Try another voice or browser.",
              );
            };
            window.speechSynthesis.speak(utterance);
          }
          return true;
        } catch {
          window.speechSynthesis.cancel();
          return false;
        }
      };

      if (engine === "natural" && canPlayAudio()) {
        const controller = new AbortController();
        requestRef.current = controller;
        void playNatural(controller.signal).then(({ ok, spoken }) => {
          if (!alive.current || run !== generation.current) return;
          if (ok) return;
          // Natural voice failed (offline, rate limit, provider outage): keep
          // the reply audible with the device voice instead of showing an error.
          // Continue from the first unheard piece rather than repeating audio.
          controller.abort();
          requestRef.current = null;
          setActiveEngine("device");
          if (!playDevice(chunks.slice(spoken))) {
            requestRef.current = null;
            setSpeaking(false);
            errorRef.current?.(
              "The voice couldn't play. Check your connection, or switch Voice quality to Device.",
            );
          }
        });
        return true;
      }

      setActiveEngine("device");
      if (playDevice()) return true;
      setSpeaking(false);
      errorRef.current?.(
        "This browser can't play spoken replies. Try Chrome, Edge or Safari for voice mode.",
      );
      return false;
    },
    [ensureAudio, stopCurrent],
  );

  return { supported, voices, speaking, activeEngine, speak, stop };
}
