import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE_SETTINGS } from "@/lib/chat/client/use-voice-mode";
import { VoiceMenu } from "./voice-menu";

const setup = (props: Partial<React.ComponentProps<typeof VoiceMenu>> = {}) => {
  const onChange = vi.fn();
  const onStop = vi.fn();
  const onSample = vi.fn();
  render(
    <VoiceMenu
      supported
      settings={DEFAULT_VOICE_SETTINGS}
      speaking={false}
      onChange={onChange}
      onStop={onStop}
      onSample={onSample}
      {...props}
    />,
  );
  return { onChange, onStop, onSample };
};

describe("<VoiceMenu />", () => {
  it("explains when the browser can't speak", async () => {
    setup({ supported: false });
    await userEvent.click(screen.getByRole("button", { name: /turn on voice mode/i }));
    expect(screen.getByRole("dialog", { name: "Voice mode" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /read replies aloud/i })).toBeDisabled();
    expect(screen.getByText(/speech isn't available in this browser/i)).toBeInTheDocument();
  });

  it("turns voice mode on and previews the chosen voice", async () => {
    const { onChange, onSample } = setup();
    await userEvent.click(screen.getByRole("button", { name: /turn on voice mode/i }));
    await userEvent.click(screen.getByRole("switch", { name: /read replies aloud/i }));
    expect(onChange).toHaveBeenCalledWith({ enabled: true });
    expect(onSample).toHaveBeenCalledWith("girl", 1);
  });

  it("offers a girl voice and a boy voice", async () => {
    const { onChange, onSample } = setup({
      settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true },
    });
    await userEvent.click(screen.getByRole("button", { name: /voice mode on/i }));
    const dialog = within(screen.getByRole("dialog", { name: "Voice mode" }));
    expect(dialog.getByRole("button", { name: /^girl voice/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(dialog.getByRole("button", { name: /^boy voice/i }));
    expect(onChange).toHaveBeenCalledWith({ voice: "boy" });
    expect(onSample).toHaveBeenCalledWith("boy", 1);
  });

  it("changes speed and stops a reply that is reading", async () => {
    const { onChange, onStop } = setup({
      settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true, handsFree: true },
      speaking: true,
    });
    await userEvent.click(screen.getByRole("button", { name: /voice mode on/i }));
    await userEvent.click(screen.getByRole("button", { name: "1.1×" }));
    expect(onChange).toHaveBeenCalledWith({ speed: 1.1 });
    await userEvent.click(screen.getByRole("button", { name: /stop reading/i }));
    expect(onStop).toHaveBeenCalled();
  });
});
