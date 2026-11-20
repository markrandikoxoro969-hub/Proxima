import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UiMessage } from "@/lib/chat/client/chat-state";
import { CodeBlock } from "./code-block";
import { Composer } from "./composer";
import { Markdown } from "./markdown";
import { MessageItem } from "./message-item";

const msg = (extra: Partial<UiMessage>): UiMessage => ({
  id: "m1",
  role: "assistant",
  content: "",
  attachments: null,
  latencyMs: null,
  createdAt: "2026-11-19T10:00:00.000Z",
  ...extra,
});

describe("<Markdown /> safety", () => {
  it("never runs HTML or javascript: links from a reply", () => {
    const { container } = render(
      <Markdown
        content={
          'Hi <script>alert(1)</script> <img src=x onerror="alert(2)">\n\n[click](javascript:alert(3))'
        }
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const link = screen.getByText("click").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("opens external links safely in a new tab", () => {
    render(<Markdown content="[Proxima](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Proxima" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders GitHub-style tables and code blocks", () => {
    render(<Markdown content={"| a | b |\n|---|---|\n| 1 | 2 |\n\n```py\nprint(1)\n```"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("print(1)")).toBeInTheDocument();
  });
});

describe("<CodeBlock />", () => {
  it("copies the exact code — quotes and all — with a real button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const code = `print("it's \`fine\`")`;
    render(<CodeBlock code={code} language="python" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith(code);
    expect(await screen.findByRole("button", { name: "Code copied" })).toBeInTheDocument();
  });

  it("labels unknown languages as text", () => {
    render(<CodeBlock code="x" language="klingon" />);
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  it("colours code once the block is complete", async () => {
    const { container } = render(<CodeBlock code="const a = 1;" language="js" />);
    await waitFor(() => expect(container.querySelector(".token.keyword")).not.toBeNull());
  });

  it("does not colour while still streaming", async () => {
    const { container } = render(<CodeBlock code="const a = 1;" language="js" live />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector(".token")).toBeNull();
  });
});

describe("<MessageItem />", () => {
  it("shows the waking-up notice during a Render cold start", () => {
    render(
      <MessageItem message={msg({ status: "streaming", phase: "waking" })} onRetry={() => {}} canRetry />,
    );
    expect(screen.getByText(/Waking up the engine…/)).toBeInTheDocument();
  });

  it("shows a friendly error with Try again", async () => {
    const onRetry = vi.fn();
    render(
      <MessageItem
        message={msg({
          status: "error",
          error: { code: "timeout", message: "Too slow, try again.", retryable: true },
        })}
        onRetry={onRetry}
        canRetry
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Too slow, try again.");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledWith("m1");
  });

  it("renders user text as plain text (no HTML)", () => {
    const { container } = render(
      <MessageItem message={msg({ role: "user", content: "<b>bold?</b>" })} onRetry={() => {}} canRetry />,
    );
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>bold?</b>")).toBeInTheDocument();
  });
});

describe("<Composer />", () => {
  const setup = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(
      <Composer
        onSend={onSend}
        onStop={() => {}}
        streaming={false}
        notify={() => {}}
        focusSignal={0}
        images={[]}
        setImages={() => {}}
        onOpenStudio={() => {}}
        {...props}
      />,
    );
    return { onSend, input: screen.getByLabelText("Message Proxima") as HTMLTextAreaElement };
  };

  it("Enter sends, Shift+Enter adds a new line", async () => {
    const { onSend, input } = setup();
    await userEvent.type(input, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(input.value).toBe("Line one\nLine two");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("Line one\nLine two", [], []);
    expect(input.value).toBe("");
  });

  it("can't send empty messages", async () => {
    const { onSend } = setup();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("counts characters and turns red near the 4000 limit", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "a".repeat(3950) } });
    const counter = screen.getByText(/3950\/4000/);
    expect(counter.className).toContain("text-red-500");
  });

  it("shows Stop while a reply is streaming", async () => {
    const onStop = vi.fn();
    setup({ streaming: true, onStop });
    await userEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("restores your text if sending couldn't start", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const { input } = setup({ onSend });
    await userEvent.type(input, "keep me{Enter}");
    await act(async () => {});
    expect(input.value).toBe("keep me");
  });

  it("attaches a text file and sends its contents", async () => {
    const { onSend, input } = setup();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, new File(["print('hi')"], "app.py", { type: "text/x-python" }));
    expect(await screen.findByText("app.py")).toBeInTheDocument();
    await userEvent.type(input, "Review{Enter}");
    expect(onSend).toHaveBeenCalledWith("Review", [{ name: "app.py", content: "print('hi')" }], []);
  });
});
