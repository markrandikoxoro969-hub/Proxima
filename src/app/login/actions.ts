"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { isEmailLoginEnabled } from "@/lib/env";

/** "Continue with Google" button. */
export async function signInWithGoogle(formData: FormData) {
  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"));
  // Throws a redirect to Google — that's normal, Next.js handles it.
  await signIn("google", { redirectTo });
}

export type EmailFormState = { status: "idle" | "error"; message?: string };

const emailSchema = z.email("Please enter a valid email address.").max(254);

/** Email magic-link form (only shown when Resend is configured). */
export async function signInWithEmail(_prev: EmailFormState, formData: FormData): Promise<EmailFormState> {
  if (!isEmailLoginEnabled()) {
    return { status: "error", message: "Email sign-in is not enabled yet. Please use Google." };
  }
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  try {
    await signIn("resend", { email: parsed.data, redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
    return { status: "idle" };
  } catch (error) {
    // AuthError = a real problem. Anything else is Next's redirect → rethrow it.
    if (error instanceof AuthError) {
      return { status: "error", message: "We couldn't send the email. Please try again in a minute." };
    }
    throw error;
  }
}
