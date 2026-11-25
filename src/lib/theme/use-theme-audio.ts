"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Theme sound preference (enabled + volume) and runtime autoplay-unlock state.
 *
 * `enabled` defaults to true so video & ambient themes play sound immediately
 * after any user interaction (clicking a theme, tapping anywhere, or clicking
 * the sound button). If the browser blocks unmuted autoplay on initial page
 * load, `blocked` flips true until the first pointer/key gesture unlocks it.
 */
export type ThemeAudioState = {
  enabled: boolean;
  volume: number;
  blocked: boolean;
};

type StoredAudio = {
  enabled: boolean;
  volume: number;
};

const KEY = "proxima:theme-audio";
const EVENT = "proxima:theme-audio-change";

const DEFAULT_STORED: StoredAudio = { enabled: true, volume: 0.45 };
const SERVER_STATE: ThemeAudioState = { ...DEFAULT_STORED, blocked: false };

let blockedRuntime = false;
let duckedRuntime = false;
let cache: { key: string; state: ThemeAudioState } | null = null;

function readStored(): StoredAudio {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STORED;
    const parsed = JSON.parse(raw) as Partial<StoredAudio>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_STORED.enabled,
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0.05, parsed.volume))
          : DEFAULT_STORED.volume,
    };
  } catch {
    return DEFAULT_STORED;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function getSnapshot(): ThemeAudioState {
  const stored = readStored();
  const key = `${stored.enabled}:${stored.volume.toFixed(2)}:${blockedRuntime}`;
  if (!cache || cache.key !== key) {
    cache = { key, state: { ...stored, blocked: blockedRuntime } };
  }
  return cache.state;
}

const getServerSnapshot = () => SERVER_STATE;

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

export function setThemeAudio(patch: Partial<StoredAudio>): void {
  const current = readStored();
  const next: StoredAudio = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    volume:
      typeof patch.volume === "number" && Number.isFinite(patch.volume)
        ? Math.min(1, Math.max(0.05, Math.round(patch.volume * 100) / 100))
        : current.volume,
  };
  if (patch.enabled === false) blockedRuntime = false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  emit();
}

export function setThemeAudioBlocked(blocked: boolean): void {
  if (blockedRuntime === blocked) return;
  blockedRuntime = blocked;
  emit();
}

/** Temporarily lowers theme audio while Proxima's voice assistant is speaking. */
export function setThemeAudioDucked(ducked: boolean): void {
  if (duckedRuntime === ducked) return;
  duckedRuntime = ducked;
  emit();
}

export function isThemeAudioDucked(): boolean {
  return duckedRuntime;
}

export function useThemeAudio() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    if (state.blocked && state.enabled) {
      setThemeAudioBlocked(false);
      emit();
      return;
    }
    setThemeAudio({ enabled: !state.enabled });
  }, [state.blocked, state.enabled]);

  const setVolume = useCallback((volume: number) => {
    setThemeAudio({ volume, enabled: true });
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setThemeAudio({ enabled });
  }, []);

  return {
    enabled: state.enabled,
    volume: state.volume,
    blocked: state.blocked,
    toggle,
    setVolume,
    setEnabled,
  };
}
