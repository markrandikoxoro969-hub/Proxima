import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const commands = [
  { id: "new", label: "New chat", hint: "⌘⇧O", icon: <span>+</span>, run: vi.fn() },
  { id: "theme", label: "Switch theme", keywords: "dark light", icon: <span>◐</span>, run: vi.fn() },
  { id: "copy", label: "Copy the last reply", icon: <span>⧉</span>, run: vi.fn() },
];

describe("<CommandPalette />", () => {
  it("focuses the search box and filters as you type", async () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);

    const input = screen.getByRole("textbox", { name: "Search commands" });
    expect(input).toHaveFocus();

    await userEvent.type(input, "theme");
    expect(screen.getByRole("option", { name: /Switch theme/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /New chat/ })).toBeNull();
  });

  it("runs the highlighted command with Enter", async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} commands={[{ ...commands[0], run }]} />,
    );

    await userEvent.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("moves with the arrow keys and closes on Escape", async () => {
    const onClose = vi.fn();
    const second = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        commands={[commands[0], { ...commands[1], run: second }]}
      />,
    );

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(second).toHaveBeenCalledOnce();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(<CommandPalette open={false} onClose={() => {}} commands={commands} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
