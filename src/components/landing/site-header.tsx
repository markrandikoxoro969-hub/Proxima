import { Logo } from "@/components/brand/logo";
import { ThemeAudioToggle } from "@/components/theme/theme-audio-toggle";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";

export const NAV = [
  { href: "#skills", label: "Skills" },
  { href: "#how", label: "How it works" },
  { href: "#demo", label: "Live demo" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Floating glass bar — the only backdrop-blur surface on the landing page. */
export function SiteHeader() {
  return (
    <header data-header className="group fixed inset-x-0 top-0 z-50 pt-safe">
      <div className="mx-3 mt-2.5 flex items-center justify-between gap-2 rounded-2xl glass py-1 pr-1.5 pl-2.5 transition-[box-shadow] duration-300 ease-premium group-data-scrolled:shadow-glow min-[1200px]:mx-auto min-[1200px]:max-w-6xl sm:mx-6">
        <Logo className="shrink-0" />
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-bold whitespace-nowrap text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-hover/40 p-0.5">
            <ThemeAudioToggle />
            <ThemeMenu syncAccount={false} />
            <ThemeToggle className="hidden sm:inline-flex" />
          </div>
          <ButtonLink
            href="/login"
            variant="ghost"
            className="hidden h-8 min-h-0 rounded-lg px-2.5 py-0 text-xs whitespace-nowrap sm:inline-flex"
          >
            Sign in
          </ButtonLink>
          <ButtonLink
            href="/app"
            className="h-8 min-h-0 rounded-xl px-3 py-0 text-xs whitespace-nowrap sm:px-3.5"
          >
            Open app
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
