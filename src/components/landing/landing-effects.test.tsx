import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingEffects } from "./landing-effects";

const media = (matches: (q: string) => boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: matches(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("<LandingEffects />", () => {
  it("shows all reveal content immediately for reduced motion", () => {
    media((q) => q.includes("reduce"));
    document.body.innerHTML = `<div data-reveal id="a"></div><div data-reveal id="b"></div>`;
    render(<LandingEffects />);
    expect(document.querySelectorAll("[data-reveal]:not([data-revealed])")).toHaveLength(0);
  });

  it("never leaves content hidden when the browser can't watch scrolling", () => {
    media(() => false);
    vi.stubGlobal("IntersectionObserver", undefined);
    // @ts-expect-error simulate an old browser
    delete window.IntersectionObserver;
    document.body.innerHTML = `<div data-reveal></div>`;
    render(<LandingEffects />);
    expect(document.querySelector("[data-reveal]")).toHaveAttribute("data-revealed");
    vi.unstubAllGlobals();
  });

  it("phones get no custom cursor", () => {
    media(() => false); // no (hover: hover) and (pointer: fine)
    const { container } = render(<LandingEffects />);
    expect(container.querySelector(".cursor-ring")).toBeNull();
    expect(document.documentElement.classList.contains("has-cursor")).toBe(false);
  });
});
