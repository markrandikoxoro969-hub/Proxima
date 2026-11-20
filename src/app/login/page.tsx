import { WarningCircle } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { isEmailLoginEnabled } from "@/lib/env";
import { site } from "@/lib/site";
import { EmailSignIn, GoogleSignIn } from "./login-buttons";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${site.name}.`,
  robots: { index: false },
};

/** Friendly text for Auth.js error codes (they arrive as ?error=Code). */
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Access was denied. While the app is in Google “Testing” mode, only added test users can sign in.",
  OAuthAccountNotLinked:
    "This email is already connected to a different sign-in method. Use that one instead.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  Configuration:
    "Sign-in isn't set up correctly on the server yet. Open /api/status?setup=1 on this site to see what to fix.",
  OAuthSignin: "Couldn't start Google sign-in. Please try again.",
  OAuthCallbackError: "Google sign-in was cancelled or failed. Please try again.",
};
const DEFAULT_ERROR = "Something went wrong while signing in. Please try again.";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR) : undefined;
  const emailEnabled = isEmailLoginEnabled();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden pt-safe pr-safe pb-safe pl-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[70vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--glow)_0%,transparent_65%)]"
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <ThemeToggle />
      </header>

      <main id="main" className="relative z-10 flex flex-1 items-center justify-center px-5 pb-16">
        {/* The ONE backdrop-blur surface on this page. */}
        <section
          aria-labelledby="login-title"
          className="w-full max-w-md animate-scale-in rounded-3xl glass p-7 sm:p-9"
        >
          <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-subtle uppercase">
            {site.version}
          </p>
          <h1 id="login-title" className="mt-3 text-3xl font-black tracking-tight text-glow sm:text-4xl">
            Welcome to {site.name}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sign in to save your chats and pick up where you left off on any device.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-300"
            >
              <WarningCircle weight="fill" className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-4">
            <GoogleSignIn callbackUrl={callbackUrl} />

            {emailEnabled && (
              <>
                <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-subtle uppercase">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>
                <EmailSignIn callbackUrl={callbackUrl} />
              </>
            )}
          </div>

          <p className="mt-7 text-xs leading-relaxed text-subtle">
            By continuing you agree to our{" "}
            <Link href="/terms" className="font-bold text-muted underline underline-offset-2 hover:text-fg">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-bold text-muted underline underline-offset-2 hover:text-fg">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
