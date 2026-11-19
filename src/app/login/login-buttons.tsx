"use client";

import { EnvelopeSimple } from "@phosphor-icons/react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signInWithEmail, signInWithGoogle, type EmailFormState } from "./actions";

/** Official multi-colour Google "G" (required by Google's branding rules). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function GoogleSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses({ size: "lg" }, "w-full bg-white text-slate-900 shadow-glow dark:bg-white")}
    >
      {pending ? <Spinner label="Redirecting to Google" /> : <GoogleIcon />}
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

export function GoogleSignIn({ callbackUrl }: { callbackUrl: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <GoogleSubmit />
    </form>
  );
}

function EmailSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses({ variant: "secondary", size: "lg" }, "w-full")}
    >
      {pending ? (
        <Spinner label="Sending link" />
      ) : (
        <EnvelopeSimple weight="bold" className="size-5" aria-hidden />
      )}
      {pending ? "Sending…" : "Email me a sign-in link"}
    </button>
  );
}

const initialEmailState: EmailFormState = { status: "idle" };

/** Shown only when AUTH_RESEND_KEY + AUTH_EMAIL_FROM are set. */
export function EmailSignIn({ callbackUrl }: { callbackUrl: string }) {
  const [state, action] = useActionState(signInWithEmail, initialEmailState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        aria-invalid={state.status === "error"}
        aria-describedby={state.status === "error" ? "email-error" : undefined}
        className="tap w-full rounded-2xl border border-line bg-surface-hover px-4 py-3.5 text-base font-semibold transition-[border-color,background-color] duration-300 ease-premium placeholder:text-subtle focus:border-line-strong focus:outline-none"
      />
      {state.status === "error" && (
        <p id="email-error" role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <EmailSubmit />
    </form>
  );
}
