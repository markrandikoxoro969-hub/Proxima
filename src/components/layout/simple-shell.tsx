import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/site";

/** Header + footer for simple pages (legal pages, 404). Server component = no extra JavaScript. */
export function SimpleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pt-safe pr-safe pb-safe pl-safe">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <ButtonLink href="/app" className="px-3.5 whitespace-nowrap min-[380px]:px-4">
            Open app
          </ButtonLink>
        </div>
      </header>
      {children}
      <footer className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-1 border-t border-line pt-6 text-sm"
        >
          {[
            { href: "/", label: "Home" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex tap items-center rounded-xl px-2 font-bold text-muted transition-colors duration-300 hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
          <span className="ml-auto px-2 text-xs text-subtle">
            © {new Date().getFullYear()} {site.name}
          </span>
        </nav>
      </footer>
    </div>
  );
}
