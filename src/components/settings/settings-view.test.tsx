import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import type { Profile } from "@/lib/chat/types";
import { buildSkillState } from "@/lib/skills/catalog";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  api: {
    updateProfile: vi.fn(),
    updateSkill: vi.fn(),
    clearAll: vi.fn(),
    deleteAccount: vi.fn(),
  },
}));
vi.mock("@/app/app/actions", () => ({ signOutAction: mocks.signOut }));
vi.mock("@/lib/chat/client/api", () => ({ api: mocks.api }));

const { SettingsView } = await import("./settings-view");

const profile: Profile = {
  id: "u1",
  name: "Sujan Shrestha",
  email: "sujan@example.com",
  image: null,
  displayName: "Sujan",
  age: 21,
  theme: "dark",
  themePalette: "proxima",
  customThemes: null,
  particles: true,
  memoryEnabled: false,
  memoryConsented: false,
  onboarded: true,
};

const renderView = (
  chatCount = 3,
  initialSkills = buildSkillState([
    { skillId: "coding-assistant", enabled: true, selected: false },
    { skillId: "web-research", enabled: true, selected: true },
  ]),
) =>
  render(
    <ThemeProvider>
      <SettingsView profile={profile} chatCount={chatCount} initialSkills={initialSkills} />
    </ThemeProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("/settings page", () => {
  it("shows your profile, chat count and account", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    const logo = screen.getByRole("link", { name: "PROXIMA home" });
    expect(logo.querySelector("span")).toHaveClass("hidden", "min-[480px]:inline");
    const skillsLink = screen.getByRole("link", { name: "Open skill settings" });
    expect(skillsLink).toHaveAttribute("href", "/settings#settings-skills");
    expect(skillsLink.querySelector("span")).toHaveClass("hidden", "min-[480px]:inline");
    expect(screen.getByLabelText("Your name")).toHaveValue("Sujan");
    expect(screen.getByLabelText("Age")).toHaveValue("21");
    expect(screen.getByText(/You have 3 saved chats/)).toBeInTheDocument();
    expect(screen.getByText("sujan@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download all \(Markdown\)/ })).toHaveAttribute(
      "href",
      "/api/export?format=md",
    );
  });

  it("selects enabled skills in Settings for every reply", async () => {
    mocks.api.updateSkill.mockResolvedValue({
      skillId: "coding-assistant",
      installed: true,
      enabled: true,
      selected: true,
    });
    renderView();

    expect(screen.getByRole("heading", { name: "Skills for every reply" })).toBeInTheDocument();
    expect(screen.getByText("1/3 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: /Coding assistant/ }));

    expect(mocks.api.updateSkill).toHaveBeenCalledWith({
      action: "set-selected",
      skillId: "coding-assistant",
      selected: true,
    });
    expect(await screen.findByText("Coding assistant will guide every reply.")).toBeInTheDocument();
    expect(screen.getByText("2/3 selected")).toBeInTheDocument();
  });

  it("prevents choosing more than three default skills", () => {
    renderView(
      0,
      buildSkillState([
        { skillId: "coding-assistant", enabled: true, selected: true },
        { skillId: "web-research", enabled: true, selected: true },
        { skillId: "writing-assistant", enabled: true, selected: true },
        { skillId: "mathematics", enabled: true, selected: false },
      ]),
    );

    expect(screen.getByText("3/3 selected")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Mathematics/ })).toBeDisabled();
  });

  it("checks name and age before saving, then saves", async () => {
    mocks.api.updateProfile.mockResolvedValue({ profile: { ...profile, displayName: "Sam" } });
    renderView();
    const age = screen.getByLabelText("Age");
    await userEvent.clear(age);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Enter an age from 1 to 120.")).toBeInTheDocument();
    expect(mocks.api.updateProfile).not.toHaveBeenCalled();

    await userEvent.type(age, "30");
    await userEvent.clear(screen.getByLabelText("Your name"));
    await userEvent.type(screen.getByLabelText("Your name"), "Sam");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.api.updateProfile).toHaveBeenCalledWith({
      displayName: "Sam",
      age: 30,
      theme: expect.any(String),
      themePalette: expect.any(String),
      customThemes: expect.any(Array),
      particles: true,
    });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("deletes all chats after confirming, then disables downloads", async () => {
    mocks.api.clearAll.mockResolvedValue({ deleted: 3 });
    renderView();
    await userEvent.click(screen.getByRole("button", { name: /Delete all chats/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(mocks.api.clearAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("You have no saved chats yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download all \(JSON\)/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: /Delete all chats/ })).toBeDisabled();
  });

  it("only deletes the account after typing DELETE, then signs out", async () => {
    mocks.api.deleteAccount.mockResolvedValue({ deleted: true });
    renderView();
    await userEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete forever" });
    const input = within(dialog).getByLabelText(/Type DELETE to confirm/);

    expect(confirm).toBeDisabled();
    await userEvent.type(input, "delete");
    expect(confirm).toBeDisabled(); // must be exactly DELETE
    await userEvent.clear(input);
    await userEvent.type(input, "DELETE");
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.api.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps you signed in and explains if deleting fails", async () => {
    mocks.api.deleteAccount.mockRejectedValue(new Error("You seem to be offline. Check your connection."));
    renderView();
    await userEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    await userEvent.type(within(dialog).getByLabelText(/Type DELETE/), "DELETE");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete forever" }));
    expect(await screen.findByText(/You seem to be offline/)).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Delete forever" })).toBeEnabled();
  });
});
