/**
 * Small helpers for calling our route handlers directly in tests
 * (no server needed — a route handler is just a function: Request → Response).
 */
export const ORIGIN = "http://localhost:3000";

type Init = { method?: string; body?: unknown; headers?: Record<string, string>; ip?: string };

export function req(
  path: string,
  { method = "GET", body, headers = {}, ip = "203.0.113.1" }: Init = {},
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      "x-forwarded-for": ip,
      ...(body !== undefined ? { "content-type": "application/json", origin: ORIGIN } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

export type SseEvent = { event: string; data: Record<string, unknown> };

/** Reads a whole SSE response into a list of { event, data }. */
export async function readSse(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(":"))
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null");
      return { event, data };
    });
}

export const replyText = (events: SseEvent[]) =>
  events
    .filter((e) => e.event === "delta")
    .map((e) => e.data.text)
    .join("");
