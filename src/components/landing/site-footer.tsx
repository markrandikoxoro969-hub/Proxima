import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/site";
import { Magnetic } from "./magnetic";
import { NAV } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line px-5 pt-24 pb-safe sm:px-8">
      {/* Final call to action */}
      <div data-reveal className="mx-auto max-w-3xl text-center">
        <h2 className="vblur text-[clamp(2.4rem,9vw,5.5rem)] leading-[0.95] font-black tracking-tighter text-balance">
          Ready when <span className="text-glow-strong">you</span> are.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base text-muted sm:text-lg">
          Sign in with Google and start your first conversation in seconds.
        </p>
        <div className="mt-9 flex justify-center">
          <Magnetic>
            <ButtonLink href="/app" size="lg">
              Start chatting <ArrowRight weight="bold" aria-hidden />
            </ButtonLink>
          </Magnetic>
        </div>
      </div>

      <div className="mx-auto mt-24 flex max-w-6xl flex-col gap-8 border-t border-line py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {site.tagline} — code, files and long questions, answered plainly.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex tap items-center text-sm font-semibold text-muted transition-colors duration-300 hover:text-fg"
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/login"
            className="inline-flex tap items-center text-sm font-semibold text-muted transition-colors duration-300 hover:text-fg"
          >
            Sign in
          </Link>
          <a
            href={site.links.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex tap items-center gap-1 text-sm font-semibold text-muted transition-colors duration-300 hover:text-fg"
          >
            Developer <ArrowUpRight weight="bold" className="size-3.5" aria-hidden />
            <span className="sr-only">(Facebook, opens in a new tab)</span>
          </a>
        </nav>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-line py-6 font-mono text-[11px] font-bold tracking-[0.15em] text-subtle uppercase sm:flex-row">
        <p>
          © {new Date().getFullYear()} {site.name} · by {site.developer}
        </p>
        <div className="flex items-center gap-1">
          <Link href="/privacy" className="inline-flex tap items-center rounded-lg px-2 hover:text-fg">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex tap items-center rounded-lg px-2 hover:text-fg">
            Terms
          </Link>
          <span className="px-2">{site.version}</span>
        </div>
      </div>

      {/* Giant faded wordmark */}
      {/* Drawn with CSS (::before) so it's pure decoration, not text that needs contrast. */}
      <div
        aria-hidden
        data-text={site.name}
        className="pointer-events-none -mb-[0.2em] text-center text-[22vw] leading-none font-black tracking-tighter text-fg opacity-[0.04] select-none before:content-[attr(data-text)]"
      />
    </footer>
  );
}
