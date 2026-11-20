"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_CHAT_MODE, isChatMode, type ChatMode } from "@/lib/ai/modes";

/**
 * The composer's answer mode, remembered on this device.
 *
 * Stored in localStorage (not the account) for the same reason as "Show
 * reasoning": it is a per-device working preference, and it must work for the
 * landing-page demo too, where there is no account. Synced across tabs.
 */
const KEY = "proxima:chat-mode";
const EVENT = "proxima:mode-change";

function read(): ChatMode {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isChatMode(stored) ? stored : DEFAULT_CHAT_MODE;
  } catch {
    return DEFAULT_CHAT_MODE; // private mode / storage disabled
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

// The server can't read localStorage; it renders the documented default.
const getServerSnapshot = () => DEFAULT_CHAT_MODE;

export function useChatMode(): [ChatMode, (mode: ChatMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, getServerSnapshot);

  const update = useCallback((next: ChatMode) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage full or blocked: the choice still works for this page */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [mode, update];
}
