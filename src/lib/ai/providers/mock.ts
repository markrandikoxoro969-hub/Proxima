import "server-only";
import { resolveChatMode } from "../modes";
import type { AiProvider } from "../types";

/**
 * Fake AI for development and tests (AI_PROVIDER=mock).
 * Works offline and answers instantly with Markdown — handy for building the UI
 * without waking the real API. Never use in production.
 *
 * It follows the composer's mode too, so Fast / Thinking / Coding / Analyze
 * can be checked end to end without an API key.
 */
export function createMockProvider(): AiProvider {
  return {
    id: "mock",
    label: "Mock AI (development)",
    async complete({ message, signal, mode }) {
      await new Promise((r) => setTimeout(r, mode === "fast" ? 120 : 300));
      if (signal.aborted) throw new Error("aborted");
      const firstLine = message.split("\n")[0].slice(0, 200);
      const wantsCode = /\b(code|script|python|function|javascript|js|css)\b/i.test(message);
      const heading = `**Mock reply** — you said: _“${firstLine}”_`;
      const note =
        "This answer comes from the **mock provider** (set `AI_PROVIDER=nvidia` or `render` for the real API).";

      switch (resolveChatMode(mode)) {
        case "fast":
          return `${heading}\n\nFast mode keeps it short. Markdown and \`inline code\` still work. ${note}`;

        case "coding":
          return [
            heading,
            "",
            "```python",
            "def greet(name: str) -> str:",
            '    """Coding mode returns complete, runnable code."""',
            '    return f"Hello, {name}!"',
            "",
            'if __name__ == "__main__":',
            '    print(greet("Proxima"))',
            "```",
            "",
            "Run it with `python greet.py`. " + note,
          ].join("\n");

        case "analyze":
          return [
            heading,
            "",
            "**What we know**",
            "",
            "- This is analysis mode: facts, assumptions and a conclusion.",
            "- Markdown tables, lists and `inline code` all render.",
            "",
            "| Part | Result |",
            "| --- | --- |",
            "| Facts | The mock provider answered |",
            "| Assumption | You are testing the interface |",
            "",
            "**Conclusion:** the mode picker is wired through to the server. " + note,
          ].join("\n");

        default:
          return [
            heading,
            "",
            note,
            "",
            "- Markdown lists work",
            "- So does `inline code`",
            ...(wantsCode
              ? [
                  "",
                  "```python",
                  "def greet(name: str) -> str:",
                  '    return f"Hello, {name}!"',
                  "",
                  'print(greet("Proxima"))',
                  "```",
                ]
              : []),
          ].join("\n");
      }
    },
    async ping() {
      return 1;
    },
  };
}
