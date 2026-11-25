"use client";

import { useCallback, useEffect, useId, useSyncExternalStore } from "react";

/**
 * Theme sound preference (enabled + volume), autoplay-unlock state, and
 * acoustic overlay state (muffled/covered when settings or menus open, and
 * ducked when Proxima's voice assistant speaks).
 *
 * Performance note:
 * - `useThemeAudio()` subscribes ONLY to `{ enabled, volume, blocked }`.
 * - `muffled` and `ducked` emit on a separate `FX_EVENT` consumed only by
 *   `<ThemeBackdrop />`, so opening a modal or speaking aloud NEVER forces
 *   the chat tree or header controls to re-render.
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
export const THEME_AUDIO_EVENT = "proxima:theme-audio-change";
export const THEME_AUDIO_FX_EVENT = "proxima:theme-audio-fx";

const DEFAULT_STORED: StoredAudio = { enabled: true, volume: 0.45 };
const SERVER_STATE: ThemeAudioState = { ...DEFAULT_STORED, blocked: false };

let blockedRuntime = false;
let duckedRuntime = false;
const muffleReasons = new Set<string>();
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
  window.addEventListener(THEME_AUDIO_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_AUDIO_EVENT, callback);
  };
}

export function getThemeAudioSnapshot(): ThemeAudioState {
  if (typeof window === "undefined") return SERVER_STATE;
  const stored = readStored();
  const key = `${stored.enabled}:${stored.volume.toFixed(2)}:${blockedRuntime}`;
  if (!cache || cache.key !== key) {
    cache = { key, state: { ...stored, blocked: blockedRuntime } };
  }
  return cache.state;
}

const getServerSnapshot = () => SERVER_STATE;

function emitState() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THEME_AUDIO_EVENT));
}

function emitFx() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THEME_AUDIO_FX_EVENT));
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
  emitState();
}

export function toggleThemeAudio(): void {
  const state = getThemeAudioSnapshot();
  if (state.blocked && state.enabled) {
    setThemeAudioBlocked(false);
    emitState();
    return;
  }
  setThemeAudio({ enabled: !state.enabled });
}

export function setThemeAudioBlocked(blocked: boolean): void {
  if (blockedRuntime === blocked) return;
  blockedRuntime = blocked;
  emitState();
}

/** Temporarily lowers and softens theme audio while Proxima's voice assistant speaks. */
export function setThemeAudioDucked(ducked: boolean): void {
  if (duckedRuntime === ducked) return;
  duckedRuntime = ducked;
  emitFx();
}

export function isThemeAudioDucked(): boolean {
  return duckedRuntime;
}

/**
 * Applies a warm low-pass "covered / dimmed" filter to theme audio while an
 * overlay (settings, dialog, command palette, mobile sidebar, etc.) is open.
 * Reference-counted by unique token so nested overlays release cleanly.
 */
export function acquireThemeAudioMuffle(token: string): () => void {
  const wasMuffled = muffleReasons.size > 0;
  muffleReasons.add(token);
  if (!wasMuffled) emitFx();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const had = muffleReasons.delete(token);
    if (had && muffleReasons.size === 0) emitFx();
  };
}

export function isThemeAudioMuffled(): boolean {
  return muffleReasons.size > 0;
}

/** Test helper: clears any leftover overlay muffle tokens. */
export function clearThemeAudioMuffles(): void {
  if (muffleReasons.size === 0) return;
  muffleReasons.clear();
  emitFx();
}

/** React hook: softly muffles/dims theme audio while `active` is true. */
export function useMuffleThemeAudio(active: boolean, reason = "overlay"): void {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    return acquireThemeAudioMuffle(`${reason}:${id}`);
  }, [active, reason, id]);
}

/** Subscribe to both state (mute/volume) and acoustic FX (muffle/duck) changes. */
export function subscribeThemeAudioEffects(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_AUDIO_EVENT, callback);
  window.addEventListener(THEME_AUDIO_FX_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_AUDIO_EVENT, callback);
    window.removeEventListener(THEME_AUDIO_FX_EVENT, callback);
  };
}

export function useThemeAudio() {
  const state = useSyncExternalStore(subscribe, getThemeAudioSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    toggleThemeAudio();
  }, []);

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
