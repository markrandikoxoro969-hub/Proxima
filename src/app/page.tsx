import {
  ArrowRight,
  Code,
  Brain,
  Microphone,
  Paperclip,
  PencilSimple,
  Planet,
  Lightbulb,
} from "@phosphor-icons/react/ssr";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/site";

/**
 * PHASE 1 placeholder — shows the design system working (fonts, colours,
 * glass, easing, dark/light). Replaced by the cinematic landing in Phase 5.
 */
const skills = [
  { icon: Code, title: "Coding", text: "Write, explain and debug code." },
  { icon: Brain, title: "Learning", text: "Hard topics, made simple." },
  { icon: PencilSimple, title: "Writing", text: "Drafts, edits and polish." },
  { icon: Lightbulb, title: "Brainstorming", text: "Ideas on demand." },
  { icon: Microphone, title: "Voice", text: "Talk instead of typing." },
  { icon: Paperclip, title: "File help", text: "Attach text & code files." },
];

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-clip pt-safe pb-safe">
      {/* Soft background glow (static, GPU-cheap). */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-1/2 left-1/2 size-[70vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--glow)_0%,transparent_65%)] opacity-60"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Planet weight="fill" className="size-7" aria-hidden />
          <span className="text-lg font-extrabold tracking-[0.2em]">{site.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <section className="flex flex-col items-center py-20 text-center sm:py-28">
          <p className="animate-fade-up font-mono text-[11px] font-bold tracking-[0.3em] text-subtle uppercase">
            {site.version} · Phase 2 · database + login
          </p>
          <h1 className="mt-5 animate-blur-in text-6xl font-black tracking-tighter text-glow-strong sm:text-8xl lg:text-9xl">
            {site.name}
          </h1>
          <p
            className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: "150ms" }}
          >
            {site.description}
          </p>
          <div
            className="mt-10 flex w-full animate-fade-up flex-col gap-3 sm:w-auto sm:flex-row"
            style={{ animationDelay: "250ms" }}
          >
            <ButtonLink href="#design" size="lg">
              View design system <ArrowRight weight="bold" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/app" variant="secondary" size="lg">
              Open app
            </ButtonLink>
          </div>
        </section>

        <section id="design" aria-labelledby="design-title" className="scroll-mt-8 pb-24">
          <h2 id="design-title" className="text-2xl font-black tracking-tight sm:text-3xl">
            Design system check
          </h2>
          <p className="mt-2 text-sm text-muted">
            Toggle the theme (top right) — everything below should switch smoothly with no flash.
          </p>

          {/* Repeated cards use glass-solid (no backdrop blur) — cheaper on phones. */}
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="group rounded-2xl glass-solid p-5 transition-[transform,border-color,box-shadow] duration-500 ease-premium hover:-translate-y-1 hover:border-line-strong hover:shadow-glow"
              >
                <Icon
                  weight="bold"
                  className="size-6 text-subtle transition-colors duration-300 group-hover:text-fg"
                  aria-hidden
                />
                <h3 className="mt-3 font-extrabold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 grid gap-3 lg:grid-cols-2">
            {/* ONE real glass surface (backdrop blur) to show the effect. */}
            <div className="rounded-2xl glass p-6">
              <p className="font-mono text-[11px] font-bold tracking-[0.25em] text-subtle uppercase">
                Typography
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight">Montserrat Black</p>
              <p className="text-xl font-semibold text-muted">Montserrat Semibold</p>
              <p className="mt-3 font-mono text-sm font-bold">const proxima = &quot;JetBrains Mono&quot;;</p>
            </div>
            <div className="rounded-2xl glass-solid p-6">
              <p className="font-mono text-[11px] font-bold tracking-[0.25em] text-subtle uppercase">
                Buttons
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </div>
              <p className="mt-4 text-xs text-subtle">
                Easing: cubic-bezier(0.16, 1, 0.3, 1) · every button ≥ 44px tall
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line py-8 text-center text-xs text-subtle">
        © {new Date().getFullYear()} {site.name} · Built by {site.developer}
      </footer>
    </div>
  );
}
