import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getEnabledSkillSummaries } from "@/lib/skills/catalog";
import { SkillPicker } from "./skill-picker";

describe("<SkillPicker />", () => {
  it("selects installed skills for replies and links to management", async () => {
    const onChange = vi.fn();
    const skills = getEnabledSkillSummaries([
      { skillId: "coding-assistant", enabled: true },
      { skillId: "writing-assistant", enabled: true },
    ]);
    render(<SkillPicker skills={skills} selected={[]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Skills" }));
    const dialog = screen.getByRole("dialog", { name: "Skills for this message" });
    await userEvent.click(within(dialog).getByRole("button", { name: /Coding assistant/ }));
    expect(onChange).toHaveBeenCalledWith(["coding-assistant"]);
    expect(within(dialog).getByRole("link", { name: "Browse and manage skills" })).toHaveAttribute(
      "href",
      "/skills",
    );
  });

  it("refreshes installation state when the picker opens", async () => {
    let finishRefresh: (() => void) | undefined;
    const onOpen = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const skills = getEnabledSkillSummaries([{ skillId: "coding-assistant", enabled: true }]);
    render(<SkillPicker skills={skills} selected={[]} onChange={vi.fn()} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing your installed skills");

    finishRefresh?.();
    expect(await screen.findByRole("button", { name: /Coding assistant/ })).toBeInTheDocument();
  });

  it("explains when there are no enabled skills", async () => {
    render(<SkillPicker skills={[]} selected={[]} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByText(/No enabled skills yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse and manage skills" })).toBeInTheDocument();
  });
});
