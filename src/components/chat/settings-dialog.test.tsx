import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import type { Profile } from "@/lib/chat/types";
import { buildSkillState } from "@/lib/skills/catalog";
import { SettingsDialog } from "./settings-dialog";

vi.mock("@/app/app/actions", () => ({
  signOutAction: vi.fn(),
}));

const PROFILE: Profile = {
  id: "u1",
  name: "Alex",
  displayName: "Alex",
  email: "alex@example.com",
  image: null,
  age: 24,
  onboarded: true,
  theme: "dark",
  themePalette: "proxima",
  customThemes: [],
  particles: true,
  memoryEnabled: true,
  memoryConsented: true,
};

describe("<SettingsDialog />", () => {
  beforeEach(() => {
    vi.spyOn(api, "listMemories").mockResolvedValue({
      enabled: true,
      consentAt: "2026-11-25T00:00:00.000Z",
      memories: [
        {
          id: "m1",
          text: "Prefers TypeScript",
          category: "preference",
          createdAt: "2026-11-25T00:00:00.000Z",
          expiresAt: null,
        },
      ],
    });
    vi.spyOn(api, "listSkills").mockResolvedValue({
      skills: buildSkillState([{ skillId: "coding-assistant", enabled: true, selected: true }]),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("switches cleanly between General, Memory, and Skills tabs", async () => {
    render(
      <ThemeProvider>
        <SettingsDialog
          open={true}
          profile={PROFILE}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onClearAll={vi.fn(async () => true)}
          notify={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("tab", { name: /general/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /memory/i }));
    await waitFor(() => {
      expect(screen.getByText("Prefers TypeScript")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /skills/i }));
    await waitFor(() => {
      expect(screen.getByText("Coding assistant")).toBeInTheDocument();
      expect(screen.getByText("1/3 selected")).toBeInTheDocument();
    });
  });
});
