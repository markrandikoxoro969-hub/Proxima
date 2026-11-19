import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Embla so we can test OUR wiring (keys, buttons, labels) in jsdom.
const listeners = new Map<string, Set<() => void>>();
let index = 0;
const api = {
  on: vi.fn((evt: string, cb: () => void) => {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt)!.add(cb);
    return api;
  }),
  off: vi.fn((evt: string, cb: () => void) => {
    listeners.get(evt)?.delete(cb);
    return api;
  }),
  selectedScrollSnap: () => index,
  scrollTo: vi.fn((i: number) => select(i)),
  scrollNext: vi.fn(() => select(Math.min(index + 1, 4))),
  scrollPrev: vi.fn(() => select(Math.max(index - 1, 0))),
};
function select(i: number) {
  index = i;
  listeners.get("select")?.forEach((cb) => cb());
}
vi.mock("embla-carousel-react", () => ({ default: () => [() => {}, api] }));

class FakeIO {
  observe() {}
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal("IntersectionObserver", FakeIO);

const { Slides } = await import("./slides");

beforeEach(() => {
  index = 0;
  listeners.clear();
  vi.clearAllMocks();
});

describe("<Slides />", () => {
  it("is an accessible carousel with only the current slide reachable", () => {
    render(<Slides />);
    expect(screen.getByRole("region", { name: "What Proxima can do" })).toHaveAttribute(
      "aria-roledescription",
      "carousel",
    );
    const slides = document.querySelectorAll('[aria-roledescription="slide"]');
    expect(slides).toHaveLength(5);
    expect(slides[0]).not.toHaveAttribute("inert");
    expect(slides[1]).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
  });

  it("next/previous buttons and dots move the slides and announce them", async () => {
    render(<Slides />);
    await userEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("Slide 2 of 5: Learning")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to slide 5: Everywhere" }));
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go to slide 5: Everywhere" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("arrow keys work when focus is inside the slides", () => {
    render(<Slides />);
    const next = screen.getByRole("button", { name: "Next slide" });
    next.focus();
    fireEvent.keyDown(next, { key: "ArrowRight" });
    expect(api.scrollNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(next, { key: "End" });
    expect(api.scrollTo).toHaveBeenCalledWith(4);
  });

  it("never steals arrow keys while you type somewhere else", () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <Slides />
      </>,
    );
    const input = screen.getByLabelText("elsewhere");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(api.scrollNext).not.toHaveBeenCalled();
  });
});
