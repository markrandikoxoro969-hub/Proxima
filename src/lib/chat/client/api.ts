import type { ChatMessageDTO, EngineStatus, MessagesPage, Profile, SessionSummary } from "../types";

/**
 * Small typed wrappers around our own API. Errors are thrown as ClientApiError
 * with the server's friendly message, ready to show in a toast.
 */
export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function toApiError(res: Response): Promise<ClientApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const fallback =
    res.status === 401
      ? "Your login expired. Please sign in again."
      : res.status >= 500
        ? "The server had a problem. Please try again."
        : "Something went wrong.";
  return new ClientApiError(body?.error?.message ?? fallback, res.status, body?.error?.code ?? "unknown");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError("You seem to be offline. Check your connection.", 0, "offline");
  }
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  listSessions: (cursor?: string | null) =>
    request<{ sessions: SessionSummary[]; nextCursor: string | null }>(
      `/api/sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  getMessages: (id: string, before?: string | null) =>
    request<MessagesPage & { session: { id: string; title: string } }>(
      `/api/sessions/${encodeURIComponent(id)}${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    ),
  renameSession: (id: string, title: string) =>
    request<{ session: SessionSummary }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteSession: (id: string) =>
    request<void>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clearAll: () => request<{ deleted: number }>(`/api/sessions?confirm=all`, { method: "DELETE" }),
  updateProfile: (
    patch: Partial<Pick<Profile, "displayName" | "age" | "theme" | "particles">> & {
      completeOnboarding?: true;
    },
  ) => request<{ profile: Profile }>(`/api/me`, { method: "PATCH", body: JSON.stringify(patch) }),
  status: () =>
    request<{ ai: { status: Exclude<EngineStatus, "checking">; latencyMs: number | null }; version: string }>(
      `/api/status`,
    ),
};

export const exportUrl = (id: string | null, format: "md" | "json") =>
  id ? `/api/sessions/${encodeURIComponent(id)}/export?format=${format}` : `/api/export?format=${format}`;

export type { ChatMessageDTO };
