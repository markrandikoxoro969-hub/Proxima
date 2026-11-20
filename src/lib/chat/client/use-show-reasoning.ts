"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * "Show reasoning" preference.
 *
 * Off by default, and stored in the browser (not the account): it is a display
 * choice for this device, and it must never turn itself on for someone else.
 * Synced across tabs through the `storage` event.
 */
const KEY = "proxima:show-reasoning";
const EVENT = "proxima:reasoning-change";

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
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // private mode / storage disabled
  }
}

// The server can't read localStorage; the toggle starts off, as documented.
const getServerSnapshot = () => false;

export function useShowReasoning(): [boolean, (value: boolean) => void] {
  const on = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* storage full or blocked: the toggle still works for this page */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [on, update];
}
