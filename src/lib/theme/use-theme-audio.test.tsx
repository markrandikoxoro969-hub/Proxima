import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acquireThemeAudioMuffle,
  clearThemeAudioMuffles,
  isThemeAudioDucked,
  isThemeAudioMuffled,
  setThemeAudioBlocked,
  setThemeAudioDucked,
  useMuffleThemeAudio,
  useThemeAudio,
} from "./use-theme-audio";
import { resolveAudioMix } from "./video-audio-graph";

describe("useThemeAudio", () => {
  beforeEach(() => {
    localStorage.clear();
    setThemeAudioBlocked(false);
    setThemeAudioDucked(false);
    clearThemeAudioMuffles();
  });

  it("defaults to enabled at a comfortable background volume", () => {
    const { result } = renderHook(() => useThemeAudio());
    expect(result.current.enabled).toBe(true);
    expect(result.current.volume).toBe(0.45);
    expect(result.current.blocked).toBe(false);
  });

  it("toggles sound on/off and clamps volume cleanly", () => {
    const { result } = renderHook(() => useThemeAudio());

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);

    act(() => result.current.setVolume(2));
    expect(result.current.enabled).toBe(true);
    expect(result.current.volume).toBe(1);

    act(() => result.current.setVolume(0));
    expect(result.current.volume).toBe(0.05);
  });

  it("tracks autoplay unlock and voice-ducking flags", () => {
    const { result } = renderHook(() => useThemeAudio());

    act(() => setThemeAudioBlocked(true));
    expect(result.current.blocked).toBe(true);

    // Tapping toggle while blocked unlocks audio instead of muting it.
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(result.current.blocked).toBe(false);

    act(() => setThemeAudioDucked(true));
    expect(isThemeAudioDucked()).toBe(true);
  });

  it("reference-counts muffled overlays cleanly so nested dialogs release safely", () => {
    expect(isThemeAudioMuffled()).toBe(false);

    const releaseSettings = acquireThemeAudioMuffle("settings");
    expect(isThemeAudioMuffled()).toBe(true);

    const releaseConfirm = acquireThemeAudioMuffle("confirm");
    expect(isThemeAudioMuffled()).toBe(true);

    releaseConfirm();
    expect(isThemeAudioMuffled()).toBe(true);

    releaseSettings();
    expect(isThemeAudioMuffled()).toBe(false);
  });

  it("acquires and releases muffle via useMuffleThemeAudio hook", () => {
    const { rerender, unmount } = renderHook(
      ({ open }: { open: boolean }) => useMuffleThemeAudio(open, "settings"),
      { initialProps: { open: false } },
    );

    expect(isThemeAudioMuffled()).toBe(false);
    rerender({ open: true });
    expect(isThemeAudioMuffled()).toBe(true);
    rerender({ open: false });
    expect(isThemeAudioMuffled()).toBe(false);

    rerender({ open: true });
    expect(isThemeAudioMuffled()).toBe(true);
    unmount();
    expect(isThemeAudioMuffled()).toBe(false);
  });

  it("computes clear, muffled, ducked, and muted DSP targets accurately", () => {
    const clear = resolveAudioMix({ enabled: true, volume: 0.5, muffled: false, ducked: false });
    expect(clear.gain).toBeCloseTo(0.5);
    expect(clear.cutoffHz).toBe(20000);

    const muffled = resolveAudioMix({ enabled: true, volume: 0.5, muffled: true, ducked: false });
    expect(muffled.gain).toBeLessThan(clear.gain);
    expect(muffled.cutoffHz).toBeLessThan(800);

    const ducked = resolveAudioMix({ enabled: true, volume: 0.5, muffled: false, ducked: true });
    expect(ducked.gain).toBeLessThan(muffled.gain);

    const muted = resolveAudioMix({ enabled: false, volume: 0.5, muffled: true, ducked: false });
    expect(muted.gain).toBe(0);
  });
});
