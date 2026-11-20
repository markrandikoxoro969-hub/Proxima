"use client";

import { useCallback, useSyncExternalStore } from "react";
import { type ChatMode, DEFAULT_MODE, isChatMode } from "@/lib/ai/modes";

/**
 * The answer mode chosen on this device (Thinking / Fast / Pro / Coding).
 *
 * Device-scoped on purpose: a phone answer and a laptop answer can want
 * different modes, and switching modes must never need a round-trip. Synced
 * across tabs through `storage`, like the other display preferences.
 */
const KEY = "proxima:chat-mode";
const EVENT = "proxima:chat-mode-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function getSnapshot(): ChatMode {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isChatMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE; // private mode / storage disabled
  }
}

// The server can't read localStorage; the first paint uses the default mode.
const getServerSnapshot = (): ChatMode => DEFAULT_MODE;

export function useChatMode(): [ChatMode, (mode: ChatMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((next: ChatMode) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: the choice still applies to this page */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [mode, update];
}
