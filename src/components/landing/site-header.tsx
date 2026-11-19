import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";

export const NAV = [
  { href: "#skills", label: "Skills" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#demo", label: "Live demo" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Floating glass bar — the only backdrop-blur surface on the landing page. */
export function SiteHeader() {
  return (
    <header data-header className="group fixed inset-x-0 top-0 z-50 pt-safe">
      <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-2xl glass py-1.5 pr-1.5 pl-3 transition-[box-shadow] duration-500 ease-premium group-data-scrolled:shadow-glow min-[1200px]:mx-auto min-[1200px]:max-w-6xl sm:mx-6">
        <Logo className="shrink-0" />
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="inline-flex tap items-center rounded-xl px-3 text-[13px] font-bold whitespace-nowrap text-muted transition-colors duration-300 hover:bg-surface-hover hover:text-fg"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <ButtonLink href="/login" variant="ghost" className="hidden whitespace-nowrap sm:inline-flex">
            Sign in
          </ButtonLink>
          <ThemeToggle />
          <ButtonLink href="/app" className="px-3.5 whitespace-nowrap min-[380px]:px-4">
            Open app
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
