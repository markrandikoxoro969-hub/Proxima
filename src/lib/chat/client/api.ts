import type { ImageDTO } from "@/lib/image/types";
import type { ChatMessageDTO, EngineStatus, MessagesPage, Profile, SessionSummary } from "../types";
import type { SkillState } from "@/lib/skills/catalog";
import type { SkillMutation } from "@/lib/skills/validation";

/** Which engine answered, and anything honest to say about the result. */
export type ImageEngineInfo = {
  id: string;
  label: string;
  /** An honest note about the image engine (never a key). */
  note?: string | null;
};

/** What an image engine reply looks like (generate + edit). */
export type ImageResult = {
  image: ImageDTO;
  engine: ImageEngineInfo;
  offline: boolean;
};

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
  deleteAccount: () =>
    request<{ deleted: true }>("/api/me", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) }),
  clearAll: () => request<{ deleted: number }>(`/api/sessions?confirm=all`, { method: "DELETE" }),
  /** Settings → Memory switch. */
  setMemoryEnabled: (enabled: boolean) =>
    request<{ enabled: boolean }>("/api/memory", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  /** Forget one memory (the "Forget this" action on a reply). */
  forgetMemory: (id: string) => request<{ deleted: number }>(`/api/memory/${id}`, { method: "DELETE" }),
  clearMemory: () => request<{ deleted: number; cleared: true }>("/api/memory", { method: "DELETE" }),
  /** Edit one memory in Settings. */
  editMemory: (id: string, text: string) =>
    request<{ memory: { id: string; text: string } }>(`/api/memory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  updateProfile: (
    patch: Partial<Pick<Profile, "displayName" | "age" | "theme" | "themePalette" | "particles">> & {
      /** Only the three source colours are needed; the server rebuilds the rest. */
      customThemes?: {
        id?: string;
        name: string;
        mode: "dark" | "light";
        colors: { bg: string; fg: string; accent: string };
      }[];
      completeOnboarding?: true;
    },
  ) => request<{ profile: Profile }>(`/api/me`, { method: "PATCH", body: JSON.stringify(patch) }),
  status: () =>
    request<{ ai: { status: Exclude<EngineStatus, "checking">; latencyMs: number | null }; version: string }>(
      `/api/status`,
    ),
  /** Discover the app-owned catalog and this account's installation state. */
  listSkills: () => request<{ skills: SkillState[] }>("/api/skills"),
  /** Install/uninstall a skill or change its enabled state. */
  updateSkill: (input: SkillMutation) =>
    request<{ skillId: string; installed: boolean; enabled: boolean }>("/api/skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /* ── Pictures ── */
  listImages: () => request<{ images: ImageDTO[]; engine?: ImageEngineInfo }>("/api/images"),
  uploadImage: (dataUrl: string, name: string) =>
    request<{ image: ImageDTO }>("/api/images", { method: "POST", body: JSON.stringify({ dataUrl, name }) }),
  deleteImage: (id: string) => request<void>(`/api/images/${encodeURIComponent(id)}`, { method: "DELETE" }),
  generateImage: (input: { prompt: string; width?: number; height?: number; style?: string }) =>
    request<ImageResult>("/api/images/generate", { method: "POST", body: JSON.stringify(input) }),
  editImage: (id: string, input: { prompt: string; strength?: number }) =>
    request<ImageResult & { original: string }>(`/api/images/${encodeURIComponent(id)}/edit`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export const exportUrl = (id: string | null, format: "md" | "json") =>
  id ? `/api/sessions/${encodeURIComponent(id)}/export?format=${format}` : `/api/export?format=${format}`;

export type { ChatMessageDTO };
