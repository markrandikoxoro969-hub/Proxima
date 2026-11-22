import { z } from "zod";
import { CHAT_MODES } from "./ai/modes";
import { IMAGE_LIMITS, IMAGE_STYLES } from "./image/limits";
import { LIMITS } from "./limits";
import { CUSTOM_THEME_LIMIT, ThemeError, buildCustomTheme, type ThemeMode } from "./theme/palettes";
import { skillSelectionSchema } from "./skills/validation";

/**
 * Input rules shared by the server (enforced) and the browser (for nice
 * messages before sending). Change limits here and both sides follow.
 */
export { LIMITS };

/** Removes invisible control characters (keeps newlines and tabs). */
const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const byteLength = (s: string) => new TextEncoder().encode(s).length;

export const attachmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.attachmentNameMax)
    .transform((n) => stripControl(n).replace(/[\\/]/g, "_")),
  content: z
    .string()
    .refine((c) => !c.includes("\u0000"), "Only text files are supported.")
    .refine((c) => byteLength(c) <= LIMITS.attachmentBytesMax, "Each file must be 100 KB or smaller."),
});

/** Pictures attached to a chat message are referenced by id (never inlined). */
export const chatImageSchema = z.object({ id: z.cuid() });

/** Guest demo only: the browser sends its own recent turns (nothing is stored). */
export const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // Trim instead of rejecting: a long earlier reply is normal, and the model
  // only receives a bounded window of it anyway.
  content: z
    .string()
    .transform((value) => stripControl(value).trim().slice(0, LIMITS.historyMessageMax))
    .pipe(z.string().min(1, "A history message can't be empty.")),
  /** Temporary chat only: image IDs in this turn; still checked against the owner. */
  images: z.array(chatImageSchema).max(IMAGE_LIMITS.perMessage).optional(),
});

export const chatRequestSchema = z.object({
  message: z
    .string()
    .transform(stripControl)
    .pipe(
      z
        .string()
        .trim()
        .min(1, "Message can't be empty.")
        .max(LIMITS.messageMax, `Message must be ${LIMITS.messageMax} characters or fewer.`),
    ),
  /** Existing conversation to continue (signed-in users). Omit to start a new one. */
  conversationId: z.cuid().optional(),
  attachments: z.array(attachmentSchema).max(LIMITS.attachmentsMax, "Attach up to 3 files.").optional(),
  /** Pictures attached to this message, by id (signed-in only). */
  images: z
    .array(chatImageSchema)
    .max(IMAGE_LIMITS.perMessage, `Attach up to ${IMAGE_LIMITS.perMessage} pictures.`)
    .optional(),
  /** Guest demo only: keeps context across demo messages. */
  demoSessionId: z.uuid().optional(),
  /**
   * "Try again" after a failed reply: if the conversation's last message is
   * this same user message, reply to it instead of saving it a second time.
   */
  retry: z.boolean().optional(),
  /** Opt in to one checkpointed coding file per HTTP request. */
  codingStep: z.boolean().optional(),
  /** Internal continuation: never save a new user message on a stale checkpoint. */
  codingContinue: z.boolean().optional(),
  /**
   * Ask the server to stream the model's private reasoning. Off by default:
   * when false, reasoning never leaves the server and is never stored.
   */
  showReasoning: z.boolean().optional(),
  /**
   * Answer style from the composer. Unknown values are rejected, so the server
   * only ever sends a mode it knows about.
   */
  mode: z.enum(CHAT_MODES).optional(),
  /** Settings-selected skills; the server verifies catalog, ownership, enabled, and selected state. */
  skills: skillSelectionSchema.optional(),
  /**
   * Temporary chat: nothing is written to the database and memory is neither
   * read nor written for this message.
   */
  temporary: z.boolean().optional(),
  /** Guest and temporary chats only — saved chats use the database. */
  history: z.array(historyMessageSchema).max(20).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * One piece of a spoken reply. The browser splits long answers before calling
 * `/api/speech`; this is the server's own hard limit, not a target.
 */
export const speechRequestSchema = z.object({
  text: z
    .string()
    .transform(stripControl)
    .pipe(
      z
        .string()
        .trim()
        .min(1, "There's nothing to read.")
        .max(LIMITS.speechChunkMax, `A spoken piece must be ${LIMITS.speechChunkMax} characters or fewer.`),
    ),
  voice: z.enum(["girl", "boy"], { error: "Choose a girl or boy voice." }),
  speed: z
    .number()
    .min(0.5, "Speed must be between 0.5× and 2×.")
    .max(2, "Speed must be between 0.5× and 2×.")
    .default(1),
});
export type SpeechRequestInput = z.infer<typeof speechRequestSchema>;

/* ── Memory ───────────────────────────────────────────────────────── */

/** Settings → Memory switch. */
export const memoryEnabledSchema = z.object({ enabled: z.boolean() });

/** One memory, as edited by the person (short sentence, no control characters). */
export const memoryTextSchema = z.object({
  text: z
    .string()
    .transform(stripControl)
    .pipe(z.string().trim().min(4, "Say a little more.").max(240, "Keep it under 240 characters.")),
});

const title = z
  .string()
  .transform(stripControl)
  .pipe(z.string().trim().min(1, "Title can't be empty.").max(LIMITS.titleMax));

/* ── Themes ───────────────────────────────────────────────────────── */

/** A theme someone built from three colours. The server rebuilds every other colour itself. */
export const customThemeInputSchema = z
  .object({
    id: z
      .string()
      .regex(/^custom-[a-z0-9-]{6,40}$/, "That theme id isn't valid.")
      .optional(),
    name: z
      .string()
      .transform(stripControl)
      .pipe(
        z
          .string()
          .trim()
          .min(1, "Give your theme a name.")
          .max(24, "Theme names are 24 characters or fewer."),
      ),
    mode: z.enum(["dark", "light"]),
    colors: z.object({
      bg: z
        .string()
        .trim()
        .regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i, "Pick a background colour."),
      fg: z
        .string()
        .trim()
        .regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i, "Pick a text colour."),
      accent: z
        .string()
        .trim()
        .regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i, "Pick an accent colour."),
    }),
  })
  .superRefine((value, ctx) => {
    try {
      buildCustomTheme({ ...value, mode: value.mode as ThemeMode });
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof ThemeError ? error.message : "That theme isn't valid.",
        path: ["colors"],
      });
    }
  });

export const createSessionSchema = z.object({ title: title.optional() });
export const renameSessionSchema = z.object({ title });

/** Deleting your account needs the word DELETE typed in, so it can't happen by accident. */
export const accountDeleteSchema = z.object({
  confirm: z.literal("DELETE", { error: "Type DELETE to confirm." }),
});

export const profileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .transform(stripControl)
      .pipe(z.string().trim().min(1, "Please enter your name.").max(LIMITS.displayNameMax)),
    age: z.number().int("Age must be a whole number.").min(1, "Please enter a valid age.").max(120),
    theme: z.enum(["dark", "light", "system"]),
    /** A built-in theme id ("midnight") or one this person created ("custom-…"). */
    themePalette: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,40}$/i, "Unknown theme."),
    customThemes: z
      .array(customThemeInputSchema)
      .max(CUSTOM_THEME_LIMIT, `You can create up to ${CUSTOM_THEME_LIMIT} themes.`),
    particles: z.boolean(),
    completeOnboarding: z.literal(true),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

/* ── Images ───────────────────────────────────────────────────────── */

/** Uploading a picture the browser already shrank (data URL). */
export const imageUploadSchema = z.object({
  dataUrl: z
    .string()
    .min(24, "No image was sent.")
    .max(IMAGE_LIMITS.dataUrlMax, "That picture is too big (max 4 MB)."),
  name: z
    .string()
    .transform(stripControl)
    .pipe(z.string().trim().min(1).max(LIMITS.attachmentNameMax))
    .optional(),
});

const imagePrompt = z
  .string()
  .transform(stripControl)
  .pipe(
    z
      .string()
      .trim()
      .min(3, "Describe the image in a few words.")
      .max(IMAGE_LIMITS.promptMax, `Keep the prompt under ${IMAGE_LIMITS.promptMax} characters.`),
  );

const imageEdge = z.number().int().min(256).max(IMAGE_LIMITS.generatedEdgeMax);

const imageStyleIds = IMAGE_STYLES.map((style) => style.id) as [
  (typeof IMAGE_STYLES)[number]["id"],
  ...(typeof IMAGE_STYLES)[number]["id"][],
];

/** "Draw me a …" — the size is optional (the studio always sends one). */
export const imageGenerateSchema = z.object({
  prompt: imagePrompt,
  width: imageEdge.optional(),
  height: imageEdge.optional(),
  style: z.enum(imageStyleIds).optional(),
});

/** "Change this picture: …" */
export const imageEditSchema = z.object({
  prompt: imagePrompt,
  /** 0.1 = subtle, 0.9 = bold. */
  strength: z.number().min(0.1).max(0.9).optional(),
});

export const exportFormatSchema = z.enum(["json", "md"]).catch("json");
