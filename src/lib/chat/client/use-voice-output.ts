"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VOICE_PROFILES, pickVoice, splitForSpeech, toSpeechText, type VoiceChoice } from "./voice";

type SpeakOptions = {
  voice: VoiceChoice;
  speed?: number;
  /** Replaces the hook-level onEnd for this utterance (used by voice previews). */
  onDone?: () => void;
};

/**
 * Speaks Proxima's answers with the browser's speech synthesis.
 *
 * Why a hook instead of one `speak()` call:
 *  - long replies are split into sentence-sized utterances (Chrome and Android
 *    cut off or stall a single very long utterance);
 *  - cancelling/replacing a reply must not fire the previous reply's "finished"
 *    callback (the generation counter);
 *  - voices load asynchronously on Chrome, so we listen for `voiceschanged`.
 *
 * Nothing is sent to our server. Most voices are on-device; some phones use a
 * network voice supplied by the browser vendor.
 */
const noopSubscribe = () => () => {};
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function useVoiceOutput({
  onEnd,
  onError,
}: {
  /** Called once when the last chunk has finished speaking (not on stop). */
  onEnd?: () => void;
  onError?: (message: string) => void;
} = {}) {
  // The server can't know whether speech synthesis exists; assume it doesn't.
  const supported = useSyncExternalStore(noopSubscribe, canSpeak, () => false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const generation = useRef(0);
  const alive = useRef(true);
  const endRef = useRef(onEnd);
  const errorRef = useRef(onError);

  useEffect(() => {
    endRef.current = onEnd;
    errorRef.current = onError;
  });

  useEffect(() => {
    if (!canSpeak()) return;
    alive.current = true;
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
      alive.current = false;
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, { voice, speed = 1, onDone }: SpeakOptions) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      errorRef.current?.("This browser can't speak replies. Try Chrome, Edge or Safari for voice mode.");
      return false;
    }
    let clean = toSpeechText(text);
    let truncated = false;
    if (clean.length > 12_000) {
      clean = clean.slice(0, 12_000);
      truncated = true;
    }
    const chunks = splitForSpeech(clean);
    if (chunks.length === 0) return false;
    if (truncated) chunks.push("The rest is on screen.");

    const run = ++generation.current;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const profile = VOICE_PROFILES[voice];
    const lang = document.documentElement.lang || "en-US";
    const picked = pickVoice(voicesRef.current, voice, lang);
    let finished = 0;
    setSpeaking(true);

    try {
      for (const chunk of chunks) {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (picked) utterance.voice = picked;
        // The replies are written in the page's language (English); using the
        // device locale here would pick a Nepali/etc. voice for English text.
        utterance.lang = picked?.lang || lang;
        utterance.pitch = profile.pitch;
        utterance.rate = Math.min(2, Math.max(0.5, speed));
        utterance.onend = () => {
          if (!alive.current || run !== generation.current) return;
          finished++;
          if (finished < chunks.length) return;
          setSpeaking(false);
          (onDone ?? endRef.current)?.();
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
    } catch {
      generation.current++;
      window.speechSynthesis.cancel();
      setSpeaking(false);
      errorRef.current?.("This device couldn't start the voice. Try another browser.");
      return false;
    }
    return true;
  }, []);

  return { supported, voices, speaking, speak, stop };
}
