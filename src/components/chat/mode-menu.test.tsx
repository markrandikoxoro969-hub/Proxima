import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModeMenu } from "./mode-menu";

describe("<ModeMenu />", () => {
  it("lists all four modes and reports the chosen one", async () => {
    const onChange = vi.fn();
    render(<ModeMenu mode="thinking" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /answer mode: thinking/i });
    await userEvent.click(trigger);

    expect(screen.getByRole("menu", { name: "Answer mode" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /thinking/i })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("menuitemradio", { name: /coding/i }));
    expect(onChange).toHaveBeenCalledWith("coding");
    // Choosing a mode closes the menu.
    expect(screen.queryByRole("menu", { name: "Answer mode" })).toBeNull();
  });

  it("closes with Escape and exposes the thinking switch", async () => {
    render(<ModeMenu mode="analyze" onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /answer mode: analyze/i }));

    const toggle = screen.getByRole("menuitemcheckbox", { name: /show thinking/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Answer mode" })).toBeNull();
  });
});
