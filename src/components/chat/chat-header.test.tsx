import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ChatHeader } from "./chat-header";

describe("<ChatHeader />", () => {
  it("places speech input beside the voice menu in the upper toolbar", () => {
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
    expect(within(header).getByRole("button", { name: "Voice input" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Voice mode" })).toBeInTheDocument();
  });

  it("renders command palette and desktop sidebar expand triggers when provided", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(onToggleDesktopSidebar).toHaveBeenCalledTimes(1);
  });
});
