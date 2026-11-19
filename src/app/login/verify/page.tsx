import { EnvelopeOpen } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

/** Shown after requesting an email sign-in link (email login, when enabled). */
export default function VerifyRequestPage() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 pt-safe pb-safe text-center"
    >
      <Logo />
      <section className="w-full max-w-md animate-scale-in rounded-3xl glass-solid p-8">
        <EnvelopeOpen weight="duotone" className="mx-auto size-12" aria-hidden />
        <h1 className="mt-4 text-2xl font-black tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          We sent you a sign-in link. Open it on this device to continue. It expires in 24 hours.
        </p>
        <ButtonLink href="/login" variant="secondary" className="mt-6 w-full">
          Back to sign in
        </ButtonLink>
      </section>
    </main>
  );
}
