"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  /** What the user chose: dark, light or system. */
  preference: ThemePreference;
  /** What is actually shown right now: dark or light. */
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ---- A tiny store so every component sees the same theme instantly ---- */
const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const media = window.matchMedia(DARK_QUERY);
  // Sync across browser tabs and when the OS theme changes.
  const onStorage = (e: StorageEvent) => e.key === THEME_STORAGE_KEY && callback();
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", callback);
  };
}

function getSnapshot(): string {
  const pref = readPreference();
  const resolved = resolveTheme(pref, window.matchMedia(DARK_QUERY).matches);
  return `${pref}:${resolved}`;
}

// On the server we can't know the theme; the inline script fixes the DOM
// before paint, and React re-syncs right after hydration.
const getServerSnapshot = () => `${DEFAULT_THEME}:dark`;

function applyToDocument(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolved]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, resolved] = snapshot.split(":") as [ThemePreference, ResolvedTheme];

  // Keep <html class="dark"> in sync (e.g. "system" + OS change, other tab).
  useEffect(() => {
    applyToDocument(resolved);
  }, [resolved]);

  const setPreference = useCallback((pref: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      /* private mode: still apply for this page view */
    }
    applyToDocument(resolveTheme(pref, window.matchMedia(DARK_QUERY).matches));
    listeners.forEach((l) => l());
  }, []);

  const toggle = useCallback(() => {
    setPreference(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setPreference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
