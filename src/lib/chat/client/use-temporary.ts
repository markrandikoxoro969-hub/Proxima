"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * "Temporary chat" switch (device-scoped, resets when you leave the page).
 *
 * While it is on, the server does not save the conversation, does not read
 * memory and does not learn anything from the messages — everything lives in
 * this tab. It is deliberately per-device and off by default: a private mode
 * that silently persisted itself would be worse than no private mode.
 */
const KEY = "proxima:temporary-chat";
const EVENT = "proxima:temporary-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function getSnapshot(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const getServerSnapshot = () => false;

export function useTemporaryChat(): [boolean, (value: boolean) => void] {
  const on = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((value: boolean) => {
    try {
      // sessionStorage: closing the tab turns the mode off again.
      window.sessionStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* storage blocked: the switch still applies to this page */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [on, update];
}
