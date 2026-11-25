"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  applyThemeToDocument,
  readStoredCustomThemes,
  readStoredPaletteId,
  readStoredPreference,
  resolveThemePreference,
  writeStoredCustomThemes,
  writeStoredPaletteId,
  writeStoredPreference,
  type ThemePreference,
  type ThemeMode,
} from "@/lib/theme";
import {
  CUSTOM_THEME_LIMIT,
  DEFAULT_THEME_FOR_MODE,
  buildCustomTheme,
  getBuiltInTheme,
  normalizeCustomThemes,
  resolveTheme,
  twinThemeId,
  type CustomThemeInput,
  type ThemePalette,
} from "@/lib/theme/palettes";

export type ThemeContextValue = {
  /** What the user chose: dark, light or system. */
  preference: ThemePreference;
  /** What is actually shown right now: dark or light. */
  resolved: ThemeMode;
  /** The palette in use (a built-in theme or one the person created). */
  theme: ThemePalette;
  paletteId: string;
  /** Themes created by this person, newest first. */
  customThemes: ThemePalette[];
  setPreference: (pref: ThemePreference) => void;
  /** Choose a theme. Also switches dark/light to match the theme. */
  setPalette: (id: string) => void;
  toggle: () => void;
  /** Validates and saves a theme. Throws ThemeError with a friendly message. */
  saveCustomTheme: (input: CustomThemeInput) => ThemePalette;
  deleteCustomTheme: (id: string) => void;
  /** Called once after login with the settings saved in the account. */
  syncFromAccount: (settings: {
    preference: ThemePreference;
    paletteId: string | null;
    customThemes: unknown;
  }) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ── A tiny store so every component sees the same theme instantly ── */

type ThemeState = {
  preference: ThemePreference;
  resolved: ThemeMode;
  paletteId: string;
  theme: ThemePalette;
  customThemes: ThemePalette[];
};

const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

const notify = () => listeners.forEach((listener) => listener());
const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

function computeState(): ThemeState {
  const preference = readStoredPreference();
  const resolved = resolveThemePreference(preference, systemPrefersDark());
  const customThemes = readStoredCustomThemes();
  const theme = resolveTheme(readStoredPaletteId(), resolved, customThemes);
  return { preference, resolved, paletteId: theme.id, theme, customThemes };
}

const stateKey = (s: ThemeState) =>
  [
    s.preference,
    s.resolved,
    s.paletteId,
    ...s.customThemes.map(
      (t) => `${t.id}:${t.name}:${t.mode}:${t.tokens.bg}:${t.tokens.fg}:${t.tokens.accent}`,
    ),
  ].join("|");

let cache: { key: string; state: ThemeState } | null = null;

function getSnapshot(): ThemeState {
  const next = computeState();
  const key = stateKey(next);
  if (!cache || cache.key !== key) cache = { key, state: next };
  return cache.state;
}

// On the server we can't know the theme; the inline script fixes the DOM
// before paint, and React re-syncs right after hydration.
const SERVER_STATE: ThemeState = {
  preference: "dark",
  resolved: "dark",
  paletteId: "proxima",
  theme: getBuiltInTheme("proxima")!,
  customThemes: [],
};
const getServerSnapshot = () => SERVER_STATE;

function subscribe(callback: () => void) {
  listeners.add(callback);
  const media = window.matchMedia(DARK_QUERY);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("proxima-")) callback();
  };
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", callback);
  };
}

/* ── Actions (module level so they're stable and testable) ────────── */

function setPalette(id: string) {
  const customThemes = readStoredCustomThemes();
  const candidate = getBuiltInTheme(id) ?? customThemes.find((theme) => theme.id === id) ?? undefined;
  if (!candidate) return;
  writeStoredPaletteId(candidate.id);
  // Picking a light theme means you want light mode (and vice versa).
  writeStoredPreference(candidate.mode);
  notify();
}

function setPreference(pref: ThemePreference) {
  // The saved palette stays as it was: `resolveTheme` shows its twin (or the
  // default for that mode) until the person picks a theme for that mode.
  writeStoredPreference(pref);
  notify();
}

function toggle() {
  const state = computeState();
  const target: ThemeMode = state.resolved === "dark" ? "light" : "dark";
  writeStoredPreference(target);
  if (state.theme.mode !== target) {
    writeStoredPaletteId(twinThemeId(state.theme, target) ?? DEFAULT_THEME_FOR_MODE[target]);
  }
  notify();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep <html class="dark"> + data-theme in sync (OS change, other tab, custom theme).
  useEffect(() => {
    applyThemeToDocument(state.theme, state.resolved);
  }, [state.theme, state.resolved]);

  const saveCustomTheme = useCallback((input: CustomThemeInput): ThemePalette => {
    const theme = buildCustomTheme(input);
    const existing = readStoredCustomThemes();
    const next = [theme, ...existing.filter((t) => t.id !== theme.id)].slice(0, CUSTOM_THEME_LIMIT);
    writeStoredCustomThemes(next);
    writeStoredPaletteId(theme.id);
    writeStoredPreference(theme.mode);
    notify();
    return theme;
  }, []);

  const deleteCustomTheme = useCallback((id: string) => {
    const next = readStoredCustomThemes().filter((t) => t.id !== id);
    writeStoredCustomThemes(next);
    if (readStoredPaletteId() === id) writeStoredPaletteId(DEFAULT_THEME_FOR_MODE[computeState().resolved]);
    notify();
  }, []);

  const syncFromAccount = useCallback<ThemeContextValue["syncFromAccount"]>((settings) => {
    const customThemes = normalizeCustomThemes(settings.customThemes);
    writeStoredCustomThemes(customThemes);
    writeStoredPreference(settings.preference);
    const resolved = resolveThemePreference(settings.preference, systemPrefersDark());
    const theme = resolveTheme(settings.paletteId, resolved, customThemes);
    writeStoredPaletteId(theme.id);
    notify();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference: state.preference,
      resolved: state.resolved,
      theme: state.theme,
      paletteId: state.paletteId,
      customThemes: state.customThemes,
      setPreference,
      setPalette,
      toggle,
      saveCustomTheme,
      deleteCustomTheme,
      syncFromAccount,
    }),
    [state, saveCustomTheme, deleteCustomTheme, syncFromAccount],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Safe variant for standalone components / tests rendered outside <ThemeProvider>. */
export function useOptionalTheme() {
  return useContext(ThemeContext);
}
