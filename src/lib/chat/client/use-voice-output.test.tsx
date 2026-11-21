import { act, renderHook } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceOutput } from "./use-voice-output";

/**
 * Mobile sound check (without a real phone): the first tap must unlock ONE
 * persistent audio element. iOS Safari blocks play() that is not tied to a
 * gesture, which used to leave the neural voice silent after it downloaded.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  preload = "";
  paused = true;
  currentTime = 0;
  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  setAttribute = vi.fn();

  constructor() {
    FakeAudio.instances.push(this);
  }
}

const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:silent"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
  else delete (URL as unknown as Record<string, unknown>).createObjectURL;
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
  else delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useVoiceOutput", () => {
  it("unlocks one reusable audio element on the first gesture", async () => {
    const { unmount } = renderHook(() => useVoiceOutput());
    expect(FakeAudio.instances).toHaveLength(0);

    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });

    expect(FakeAudio.instances).toHaveLength(1);
    const audio = FakeAudio.instances[0]!;
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe("blob:silent");

    // A later tap must not create another element (or play a second sound).
    await act(async () => {
      document.dispatchEvent(new Event("click"));
    });
    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio.play).toHaveBeenCalledTimes(1);

    unmount();
  });
});
