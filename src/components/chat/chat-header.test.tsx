import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ChatHeader } from "./chat-header";

describe("<ChatHeader />", () => {
  it("organizes voice input and voice mode inside the floating glass controls menu and morphs into the theme menu in place", () => {
    render(
      <ThemeProvider>
        <ChatHeader
          title={null}
          activeId={null}
          sidebarOpen={false}
          isDesktop={false}
          onOpenSidebar={vi.fn()}
          onNewChat={vi.fn()}
          voiceInput={<button type="button" aria-label="Voice input" />}
          voiceMenu={<button type="button" aria-label="Voice mode" />}
        />
      </ThemeProvider>,
    );

    const header = screen.getByRole("banner");
    const controlsTrigger = within(header).getByRole("button", { name: "Open controls menu" });
    fireEvent.click(controlsTrigger);

    expect(within(header).getByRole("button", { name: "Voice input" })).toBeVisible();
    expect(within(header).getByRole("button", { name: "Voice mode" })).toBeVisible();

    // Clicking Themes transforms the same popover in place into the theme menu
    fireEvent.click(within(header).getByRole("button", { name: "Open theme menu" }));
    expect(within(header).getByRole("menu", { name: "Theme" })).toBeVisible();
    expect(within(header).getByRole("button", { name: "Back to controls" })).toBeVisible();

    // Clicking Back morphs smoothly back to the main controls view
    fireEvent.click(within(header).getByRole("button", { name: "Back to controls" }));
    expect(within(header).getByRole("button", { name: "Voice input" })).toBeVisible();
  });

  it("opens command palette from the controls menu and renders desktop sidebar expand", () => {
    const onOpenPalette = vi.fn();
    const onToggleDesktopSidebar = vi.fn();
    render(
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
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open controls menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(onToggleDesktopSidebar).toHaveBeenCalledTimes(1);
  });
});
