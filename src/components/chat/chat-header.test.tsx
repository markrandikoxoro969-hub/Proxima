import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MotionProvider } from "@/components/motion/motion-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { isThemeAudioMuffled } from "@/lib/theme/use-theme-audio";
import { ChatHeader } from "./chat-header";

const mockVoiceMenuProps = {
  supported: true,
  settings: {
    enabled: false,
    voice: "girl" as const,
    engine: "natural" as const,
    speed: 1,
    handsFree: false,
  },
  speaking: false,
  activeEngine: null,
  onChange: vi.fn(),
  onStop: vi.fn(),
  onSample: vi.fn(),
};

describe("<ChatHeader />", () => {
  it("morphs smoothly in place between Controls, Sound & Voice (Male/Female), and Themes", async () => {
    render(
      <MotionProvider>
        <ThemeProvider>
          <ChatHeader
            title={null}
            activeId="c1"
            sidebarOpen={false}
            isDesktop={false}
            onOpenSidebar={vi.fn()}
            onNewChat={vi.fn()}
            voiceInput={<button type="button" aria-label="Voice input" />}
            voiceMenuProps={mockVoiceMenuProps}
          />
        </ThemeProvider>
      </MotionProvider>,
    );

    const header = screen.getByRole("banner");
    fireEvent.click(within(header).getByRole("button", { name: "Open controls menu" }));
    await waitFor(() =>
      expect(within(header).getByRole("button", { name: "Voice input" })).toBeVisible(),
    );

    // Morph into Sound & Voice view (Female / Male voice options inside the same glass card)
    fireEvent.click(within(header).getByRole("button", { name: "Open sound and voice menu" }));
    await waitFor(() =>
      expect(within(header).getByRole("dialog", { name: "Sound and voice" })).toBeVisible(),
    );
    expect(await within(header).findByRole("button", { name: /^Girl voice/i })).toBeVisible();
    expect(within(header).getByRole("button", { name: /^Boy voice/i })).toBeVisible();

    // Back to Controls
    fireEvent.click(within(header).getByRole("button", { name: "Back to controls" }));
    await waitFor(() =>
      expect(within(header).getByRole("button", { name: "Open theme menu" })).toBeVisible(),
    );

    // Morph into Themes view inside the same glass card — muffles live video audio cleanly
    fireEvent.click(within(header).getByRole("button", { name: "Open theme menu" }));
    const themeMenu = await within(header).findByRole("menu", { name: "Theme" });
    await waitFor(() => expect(themeMenu).toBeVisible());
    expect(isThemeAudioMuffled()).toBe(true);

    // Back to Controls releases muffle
    fireEvent.click(within(themeMenu).getByRole("button", { name: "Back to controls" }));
    await waitFor(() =>
      expect(within(header).getByRole("button", { name: "Open memes and aesthetic vibes menu" })).toBeVisible(),
    );
    expect(isThemeAudioMuffled()).toBe(false);

    // Morph into Vibes & Memes view right alongside Themes
    fireEvent.click(within(header).getByRole("button", { name: "Open memes and aesthetic vibes menu" }));
    const vibesDialog = await within(header).findByRole("dialog", { name: "Memes and aesthetic vibes" });
    await waitFor(() => expect(vibesDialog).toBeVisible());
    expect(await within(vibesDialog).findByRole("button", { name: "Gojo" })).toBeVisible();
    expect(isThemeAudioMuffled()).toBe(true);

    // Back to Controls
    fireEvent.click(within(vibesDialog).getByRole("button", { name: "Back to controls" }));
    await waitFor(() =>
      expect(within(header).getByRole("button", { name: "Voice input" })).toBeVisible(),
    );
  });

  it("opens command palette from the controls menu and renders desktop sidebar expand", () => {
    const onOpenPalette = vi.fn();
    const onToggleDesktopSidebar = vi.fn();
    render(
      <MotionProvider>
        <ThemeProvider>
          <ChatHeader
            title="My Chat"
            activeId="c1"
            sidebarOpen={false}
            isDesktop={true}
            desktopCollapsed={true}
            onToggleDesktopSidebar={onToggleDesktopSidebar}
            onOpenPalette={onOpenPalette}
            onOpenSidebar={vi.fn()}
            onNewChat={vi.fn()}
          />
        </ThemeProvider>
      </MotionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open controls menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(onToggleDesktopSidebar).toHaveBeenCalledTimes(1);
  });
});
