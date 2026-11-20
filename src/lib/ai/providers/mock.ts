import "server-only";
import type { AiProvider } from "../types";

/**
 * Fake AI for development and tests (AI_PROVIDER=mock).
 * Works offline and answers instantly with Markdown — handy for building the UI
 * without waking the real API. Never use in production.
 */
export function createMockProvider(): AiProvider {
  return {
    id: "mock",
    label: "Mock AI (development)",
    async complete({ message, signal }) {
      await new Promise((r) => setTimeout(r, 300));
      if (signal.aborted) throw new Error("aborted");
      const firstLine = message.split("\n")[0].slice(0, 200);
      const wantsCode = /\b(code|script|python|function|javascript|js|css)\b/i.test(message);
      return [
        `**Mock reply** — you said: _“${firstLine}”_`,
        "",
        "This answer comes from the **mock provider** (set `AI_PROVIDER=nvidia` or `render` for the real API).",
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
    },
    async ping() {
      return 1;
    },
  };
}
