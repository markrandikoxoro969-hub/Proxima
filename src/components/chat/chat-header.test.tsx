import { render, screen, within } from "@testing-library/react";
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
});
