import "server-only";
import { ZodError } from "zod";

/**
 * Consistent API responses. Every error looks like:
 *   { "error": { "code": "rate_limited", "message": "Too many messages…" } }
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiErrors = {
  badRequest: (message = "Invalid request.") => new ApiError(400, "bad_request", message),
  unauthorized: () => new ApiError(401, "unauthorized", "Please sign in to continue."),
  forbidden: (message = "Not allowed.") => new ApiError(403, "forbidden", message),
  notFound: (what = "Not found") => new ApiError(404, "not_found", `${what}.`),
  tooLarge: () => new ApiError(413, "too_large", "That request is too large."),
  unsupportedMedia: () =>
    new ApiError(415, "unsupported_media_type", "Send JSON (Content-Type: application/json)."),
};

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(NO_STORE)) if (!headers.has(k)) headers.set(k, v);
  return Response.json(data, { ...init, headers });
}

/**
 * Zod's default messages are developer-facing ("Too big: expected string to
 * have <=4000 characters"). People should never see those in a chat. Custom
 * messages (our `.max(…, "…")` ones) are kept as written.
 */
function friendlyZodMessage(issue: ZodError["issues"][number] | undefined): string {
  if (!issue) return "Invalid input.";
  // A message we wrote for people wins over the generic translation.
  const technical =
    /^(too big|too small|invalid\b|expected |unrecognized key|too many items|not a multiple)/i.test(
      issue.message,
    );
  if (!technical) return issue.message;
  if (issue.code === "too_big") return "That input is too long.";
  if (issue.code === "too_small") return "That input is too short.";
  if (issue.code === "invalid_type") return "That input isn't valid.";
  return "Please check that input and try again.";
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: error.headers },
    );
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return json(
      {
        error: {
          code: "validation_error",
          message: friendlyZodMessage(first),
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: friendlyZodMessage(i),
          })),
        },
      },
      { status: 400 },
    );
  }
  const id = crypto.randomUUID().slice(0, 8);
  console.error(`[api] unexpected error ${id}:`, error);
  return json(
    {
      error: {
        code: "internal_error",
        message: `Something went wrong on our side (ref ${id}). Please try again.`,
      },
    },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function withApi<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Reads a JSON body safely: checks type and size before parsing. */
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) throw apiErrors.unsupportedMedia();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw apiErrors.tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw apiErrors.tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw apiErrors.badRequest("Body must be valid JSON.");
  }
}
