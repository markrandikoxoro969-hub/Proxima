"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_PEEKER_ID,
  isPeekerCompanionId,
  type PeekerCompanionId,
} from "./composer-memes";

/**
 * Preferences for the chat typing-box memes & peeking companion.
 *
 * Stored in localStorage on this device and synced across tabs via `storage`
 * + a custom same-tab event (same pattern as `useShowReasoning`).
 */
export type ComposerVibePrefs = {
  memesEnabled: boolean;
  peekerEnabled: boolean;
  peekerId: PeekerCompanionId;
};

const KEY = "proxima:composer-vibes";
const EVENT = "proxima:composer-vibes-change";

const DEFAULT_PREFS: ComposerVibePrefs = {
  memesEnabled: true,
  peekerEnabled: true,
  peekerId: DEFAULT_PEEKER_ID,
};

let cache: { raw: string | null; value: ComposerVibePrefs } | null = null;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function getSnapshot(): ComposerVibePrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return DEFAULT_PREFS;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT_PREFS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ComposerVibePrefs>;
      value = {
        memesEnabled: typeof parsed.memesEnabled === "boolean" ? parsed.memesEnabled : true,
        peekerEnabled: typeof parsed.peekerEnabled === "boolean" ? parsed.peekerEnabled : true,
        peekerId: isPeekerCompanionId(parsed.peekerId) ? parsed.peekerId : DEFAULT_PEEKER_ID,
      };
    } catch {
      value = DEFAULT_PREFS;
    }
  }
  cache = { raw, value };
  return value;
}

const getServerSnapshot = () => DEFAULT_PREFS;

export function writeComposerVibes(patch: Partial<ComposerVibePrefs>): void {
  const next = { ...getSnapshot(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useComposerVibes(): [ComposerVibePrefs, (patch: Partial<ComposerVibePrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((patch: Partial<ComposerVibePrefs>) => writeComposerVibes(patch), []);
  return [prefs, update];
}
