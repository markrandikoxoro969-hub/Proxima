import { SignOut } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import { signOut } from "@/auth";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "App", robots: { index: false } };

/**
 * PHASE 2 placeholder: proves login + database work.
 * Phase 4 replaces this with the full chat app.
 */
export default async function AppPage() {
  // Double-check on the server (the proxy already redirected guests).
  const user = await requireUser("/app");
  const shownName = user.displayName ?? user.name ?? "Explorer";

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="flex min-h-dvh flex-col pt-safe pb-safe">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-5 pb-16">
        <section className="w-full max-w-md animate-scale-in rounded-3xl glass-solid p-8 text-center">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={72}
              height={72}
              className="mx-auto rounded-full shadow-glow"
              priority
            />
          ) : (
            <div className="mx-auto flex size-[72px] items-center justify-center rounded-full bg-inverse text-2xl font-black text-on-inverse">
              {shownName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="mt-5 text-2xl font-black tracking-tight">Hi, {shownName} 👋</h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>

          <div className="mt-6 rounded-2xl border border-line bg-surface-hover p-4 text-left text-sm">
            <p className="font-bold">✓ Signed in with Google</p>
            <p className="mt-1 font-bold">✓ Saved in your Neon database</p>
            <p className="mt-1 font-mono text-xs break-all text-subtle">user id: {user.id}</p>
          </div>

          <p className="mt-6 text-sm text-muted">The chat app arrives in Phase 4.</p>

          <form action={handleSignOut} className="mt-6">
            <Button type="submit" variant="secondary" className="w-full">
              <SignOut weight="bold" className="size-5" aria-hidden /> Sign out
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
