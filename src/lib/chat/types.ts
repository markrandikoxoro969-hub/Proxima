/**
 * Shapes shared by the server (API + page) and the browser.
 * Dates are ISO strings because that's what JSON carries.
 */
export type AttachmentMeta = { name: string; size: number; language: string };

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
  particles: boolean;
  onboarded: boolean;
};

export type EngineStatus = "checking" | "online" | "waking" | "offline";
