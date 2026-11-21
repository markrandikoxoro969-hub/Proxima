import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSkillState } from "@/lib/skills/catalog";

const mocks = vi.hoisted(() => ({ api: { updateSkill: vi.fn() } }));
vi.mock("@/lib/chat/client/api", () => ({ api: mocks.api }));

const { SkillsMarketplace } = await import("./skills-marketplace");

function renderMarketplace(installed: { skillId: string; enabled: boolean }[] = []) {
  return render(<SkillsMarketplace initialSkills={buildSkillState(installed)} />);
}

beforeEach(() => vi.clearAllMocks());

describe("Skills marketplace", () => {
  it("searches and filters by skill category", async () => {
    renderMarketplace();
    const search = screen.getByRole("searchbox", { name: "Search skills or capabilities" });
    await userEvent.type(search, "writing assistant");

    expect(screen.getByRole("heading", { name: "Writing assistant" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coding assistant" })).toBeNull();

    await userEvent.clear(search);
    await userEvent.click(screen.getByRole("button", { name: "Mathematics" }));
    expect(screen.getByRole("heading", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Writing assistant" })).toBeNull();
  });

  it("installs a skill and reflects the server-confirmed state", async () => {
    mocks.api.updateSkill.mockResolvedValue({
      skillId: "coding-assistant",
      installed: true,
      enabled: true,
    });
    renderMarketplace();
    const card = screen.getByRole("article", { name: /Coding assistant/ });

    await userEvent.click(within(card).getByRole("button", { name: "Install skill" }));
    expect(mocks.api.updateSkill).toHaveBeenCalledWith({ action: "install", skillId: "coding-assistant" });
    expect(await within(card).findByRole("switch", { name: "Disable Coding assistant" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByText("Coding assistant installed and enabled.")).toBeInTheDocument();
  });

  it("does not claim an idempotently installed skill was enabled", async () => {
    mocks.api.updateSkill.mockResolvedValue({
      skillId: "coding-assistant",
      installed: true,
      enabled: false,
    });
    renderMarketplace();
    const card = screen.getByRole("article", { name: /Coding assistant/ });

    await userEvent.click(within(card).getByRole("button", { name: "Install skill" }));

    expect(await within(card).findByRole("switch", { name: "Enable Coding assistant" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      await screen.findByText(
        "Coding assistant is installed but remains disabled. Turn it on when you're ready.",
      ),
    ).toBeInTheDocument();
  });

  it("enables, disables, and uninstalls an installed skill", async () => {
    mocks.api.updateSkill
      .mockResolvedValueOnce({ skillId: "coding-assistant", installed: true, enabled: false })
      .mockResolvedValueOnce({ skillId: "coding-assistant", installed: false, enabled: false });
    renderMarketplace([{ skillId: "coding-assistant", enabled: true }]);
    const card = screen.getByRole("article", { name: /Coding assistant/ });

    await userEvent.click(within(card).getByRole("switch", { name: "Disable Coding assistant" }));
    expect(mocks.api.updateSkill).toHaveBeenNthCalledWith(1, {
      action: "set-enabled",
      skillId: "coding-assistant",
      enabled: false,
    });
    expect(await within(card).findByRole("switch", { name: "Enable Coding assistant" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await userEvent.click(within(card).getByRole("button", { name: "Uninstall" }));
    expect(mocks.api.updateSkill).toHaveBeenNthCalledWith(2, {
      action: "uninstall",
      skillId: "coding-assistant",
    });
    expect(await within(card).findByRole("button", { name: "Install skill" })).toBeInTheDocument();
  });

  it("keeps installation state unchanged and reports a failed action", async () => {
    mocks.api.updateSkill.mockRejectedValue(new Error("Skills service is unavailable."));
    renderMarketplace();
    const card = screen.getByRole("article", { name: /Coding assistant/ });

    await userEvent.click(within(card).getByRole("button", { name: "Install skill" }));

    expect(await screen.findByText("Skills service is unavailable.")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Install skill" })).toBeEnabled();
    expect(within(card).queryByText("Installed")).toBeNull();
  });

  it("shows a helpful empty state for the installed-skills view", async () => {
    renderMarketplace();
    await userEvent.click(screen.getByRole("tab", { name: /Installed/ }));
    expect(screen.getByText("No installed skills match")).toBeInTheDocument();
    expect(screen.getByText(/do not download or run code/i)).toBeInTheDocument();
  });
});
