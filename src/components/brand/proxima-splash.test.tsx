import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProximaSplash } from "./proxima-splash";

describe("<ProximaSplash />", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("types Proxima and fades out cleanly after initial load", () => {
    render(<ProximaSplash />);
    expect(screen.getByRole("status", { name: "Loading Proxima" })).toBeInTheDocument();

    // Advance past boot + 7 letters * 90ms
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText("Proxima")).toBeInTheDocument();

    // Advance past hold (650ms) + fade (400ms)
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.queryByRole("status", { name: "Loading Proxima" })).not.toBeInTheDocument();
  });

  it("replays whenever the user leaves and returns to the tab", () => {
    render(<ProximaSplash />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("status", { name: "Loading Proxima" })).not.toBeInTheDocument();

    // Simulate leaving the tab
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Simulate returning to the tab
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("status", { name: "Loading Proxima" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText("Proxima")).toBeInTheDocument();
  });
});
