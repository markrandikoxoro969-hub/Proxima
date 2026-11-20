import type { ThemePalette } from "@/lib/theme/palettes";

/**
 * Shapes shared by the server (API + page) and the browser.
 * Dates are ISO strings because that's what JSON carries.
 */

/**
 * What we remember about a message attachment.
 * Text/code files keep their name + size; pictures also carry a URL so the
 * chat can show the image itself (the bytes are never sent with the message).
 */
export type AttachmentMeta = {
  name: string;
  size: number;
  language: string;
  /** Omitted for older rows; treat as "file". */
  kind?: "file" | "image";
  /** /api/images/<id> — present for images. */
  url?: string;
  imageId?: string;
  width?: number;
  height?: number;
};

export type SessionSummary = {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageDTO = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: AttachmentMeta[] | null;
  latencyMs: number | null;
  createdAt: string;
};

export type MessagesPage = {
  messages: ChatMessageDTO[];
  hasMore: boolean;
  nextBefore: string | null;
};

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  displayName: string | null;
  age: number | null;
  theme: "dark" | "light" | "system";
  /** Built-in theme id ("midnight") or "custom-…". */
  themePalette: string;
  /** Themes this person created (already validated). */
  customThemes: ThemePalette[] | null;
  particles: boolean;
  /** What PROXIMA remembers between chats ("- 2026-11-19: going to the gym"). */
  memoryNotes: string | null;
  onboarded: boolean;
};

export type EngineStatus = "checking" | "online" | "waking" | "offline";
