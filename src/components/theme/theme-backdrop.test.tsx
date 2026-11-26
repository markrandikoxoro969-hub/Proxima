import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBuiltInTheme } from "@/lib/theme/palettes";
import { ThemeBackdrop } from "./theme-backdrop";

const mockUseTheme = vi.fn();

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

function mockMatchMedia(mobile: boolean, reducedMotion = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches:
        query.includes("prefers-reduced-motion")
          ? reducedMotion
          : query.includes("max-width: 767px") || query.includes("pointer: coarse")
            ? mobile
            : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ThemeBackdrop", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders lightweight Animated WebP loop on mobile without loading <video>", async () => {
    mockMatchMedia(true);
    mockUseTheme.mockReturnValue({ theme: getBuiltInTheme("crimson-velvet")! });

    const { container } = render(<ThemeBackdrop />);

    await waitFor(() => {
      const webp = container.querySelector('img[src="/media/themes/crimson-velvet-mobile.webp"]');
      expect(webp).toBeTruthy();
    });

    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.style.display).toBe("none");

    // Decoupled soundtrack still loads on <audio> for mobile music + Settings muffle.
    const audio = container.querySelector("audio")!;
    await waitFor(() => {
      expect(audio.getAttribute("src")).toBe("/media/themes/crimson-velvet.m4a");
    });

    // No redundant full-screen scrim layer.
    expect(container.querySelector(".tb-media-scrim")).toBeNull();
  });

  it("plays pure silent <video> and decoupled <audio> on desktop", async () => {
    mockMatchMedia(false);
    mockUseTheme.mockReturnValue({ theme: getBuiltInTheme("torn-veil")! });

    const { container } = render(<ThemeBackdrop />);

    const video = container.querySelector("video")!;
    await waitFor(() => {
      expect(video.getAttribute("src")).toBe("/media/themes/torn-veil.mp4");
    });
    expect(video.muted).toBe(true);

    // Desktop should not render the mobile WebP loop.
    expect(container.querySelector('img[src="/media/themes/torn-veil-mobile.webp"]')).toBeNull();

    // Audio plays via standalone <audio>, keeping <video> decoupled from Web Audio.
    const audio = container.querySelector("audio")!;
    await waitFor(() => {
      expect(audio.getAttribute("src")).toBe("/media/themes/torn-veil.m4a");
    });
  });
});
