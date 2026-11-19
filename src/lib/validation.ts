import { z } from "zod";

/**
 * Input rules shared by the server (enforced) and the browser (for nice
 * messages before sending). Change limits here and both sides follow.
 */
export const LIMITS = {
  messageMax: 4000,
  demoMessageMax: 500,
  attachmentsMax: 3,
  attachmentBytesMax: 100 * 1024, // 100 KB per file
  attachmentNameMax: 200,
  titleMax: 120,
  displayNameMax: 40,
} as const;

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
  /** Guest demo only: keeps context across demo messages. */
  demoSessionId: z.uuid().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

const title = z
  .string()
  .transform(stripControl)
  .pipe(z.string().trim().min(1, "Title can't be empty.").max(LIMITS.titleMax));

export const createSessionSchema = z.object({ title: title.optional() });
export const renameSessionSchema = z.object({ title });

export const profileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .transform(stripControl)
      .pipe(z.string().trim().min(1, "Please enter your name.").max(LIMITS.displayNameMax)),
    age: z.number().int("Age must be a whole number.").min(1, "Please enter a valid age.").max(120),
    theme: z.enum(["dark", "light", "system"]),
    particles: z.boolean(),
    completeOnboarding: z.literal(true),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const exportFormatSchema = z.enum(["json", "md"]).catch("json");
