import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  isThemeAudioDucked,
  setThemeAudioBlocked,
  setThemeAudioDucked,
  useThemeAudio,
} from "./use-theme-audio";

describe("useThemeAudio", () => {
  beforeEach(() => {
    localStorage.clear();
    setThemeAudioBlocked(false);
    setThemeAudioDucked(false);
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
});
