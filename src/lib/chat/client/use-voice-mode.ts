"use client";

import { useCallback, useSyncExternalStore } from "react";
import { VOICE_SPEEDS, isVoiceChoice, type VoiceChoice } from "./voice";

/**
 * Voice mode preferences, remembered on this device.
 *
 * `enabled`   → each new answer is read aloud.
 * `handsFree` → after the answer finishes speaking, open the mic for the next
 *               question (the mic is never open while Proxima is talking).
 * `voice`     → "girl" or "boy".
 * `speed`     → 0.9, 1 or 1.1.
 *
 * Stored in localStorage (not the account) like the answer mode: it is a
 * per-device choice, and the landing demo has no account at all.
 */
export type VoiceSettings = {
  enabled: boolean;
  handsFree: boolean;
  voice: VoiceChoice;
  speed: number;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  handsFree: false,
  voice: "girl",
  speed: 1,
};

const KEY = "proxima:voice-mode";
const EVENT = "proxima:voice-change";

function sanitize(value: unknown): VoiceSettings {
  if (!value || typeof value !== "object") return DEFAULT_VOICE_SETTINGS;
  const raw = value as Partial<VoiceSettings>;
  const speed =
    typeof raw.speed === "number" && VOICE_SPEEDS.includes(raw.speed as (typeof VOICE_SPEEDS)[number])
      ? raw.speed
      : 1;
  return {
    enabled: raw.enabled === true,
    handsFree: raw.handsFree === true,
    voice: isVoiceChoice(raw.voice) ? raw.voice : DEFAULT_VOICE_SETTINGS.voice,
    speed,
  };
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

// useSyncExternalStore requires getSnapshot to return the same object until the
// stored value actually changes, so the parsed settings are cached by raw string.
let cachedRaw: string | null | undefined;
let cached: VoiceSettings = DEFAULT_VOICE_SETTINGS;
/** Used when localStorage is blocked (private mode): the choice lives in memory. */
let memoryOnly: VoiceSettings | null = null;

function read(): VoiceSettings {
  if (memoryOnly) return memoryOnly;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cached;
    let value = DEFAULT_VOICE_SETTINGS;
    if (raw) {
      try {
        value = sanitize(JSON.parse(raw));
      } catch {
        value = DEFAULT_VOICE_SETTINGS; // bad JSON from an older build
      }
    }
    cachedRaw = raw;
    cached = value;
    return value;
  } catch {
    return DEFAULT_VOICE_SETTINGS; // private mode / storage disabled
  }
}

// The server can't read localStorage; render the documented default.
const getServerSnapshot = () => DEFAULT_VOICE_SETTINGS;

export function useVoiceMode(): [VoiceSettings, (patch: Partial<VoiceSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, read, getServerSnapshot);

  const update = useCallback((patch: Partial<VoiceSettings>) => {
    const next = sanitize({ ...read(), ...patch });
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      memoryOnly = null;
    } catch {
      // Storage full or blocked: keep the choice for this page.
      memoryOnly = next;
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [settings, update];
}
