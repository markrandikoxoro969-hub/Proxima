import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

describe("<ThemeToggle />", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "dark";
  });

  it("is keyboard-accessible and labelled", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const btn = screen.getByRole("button", { name: /switch between dark and light/i });
    expect(btn).toBeInTheDocument();
  });

  it("switches dark → light → dark and remembers the choice", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
