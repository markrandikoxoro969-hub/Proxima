import { ArrowDown, ArrowRight } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/site";
import { HeroParticles } from "./hero-particles";
import { Magnetic } from "./magnetic";
import { Parallax } from "./scroll-fx";

const LINES = ["Think brighter.", "Build faster."];
/** Word number each line starts at (so words reveal one after another across lines). */
const LINE_STARTS = LINES.map((_, i) => LINES.slice(0, i).join(" ").split(" ").filter(Boolean).length);

/** Splits the headline into words that each go blur → sharp, one after another. */
function RevealWords({ text, start }: { text: string; start: number }) {
  return text.split(" ").map((word, i) => (
    <span key={i}>
      <span className="reveal-word" style={{ "--i": start + i } as React.CSSProperties}>
        {word}
      </span>
      {i < text.split(" ").length - 1 ? " " : null}
    </span>
  ));
}

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 pt-28 pb-24 text-center sm:px-8"
    >
      <HeroParticles />

      {/* Static glow + orbit rings (drift slowly on scroll on desktop). */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[80vmax] -translate-1/2 rounded-full bg-[radial-gradient(circle,var(--glow)_0%,transparent_60%)]"
      />
      <Parallax speed={0.55} className="pointer-events-none absolute inset-0 -z-10">
        <div aria-hidden className="vblur flex h-full w-full items-center justify-center">
          <div className="absolute top-1/2 left-1/2 size-[min(92vw,760px)] -translate-1/2 rounded-full border border-line" />
          <div className="orbit-ring absolute top-1/2 left-1/2 size-[min(70vw,560px)] -translate-1/2 rounded-full border border-dashed border-line-strong">
            <span className="absolute top-0 left-1/2 size-2 -translate-1/2 rounded-full bg-fg shadow-glow-strong" />
          </div>
          <div className="orbit-ring orbit-ring--reverse absolute top-1/2 left-1/2 size-[min(48vw,380px)] -translate-1/2 rounded-full border border-line">
            <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-subtle" />
          </div>
        </div>
      </Parallax>

      <p className="animate-fade-up font-mono text-[11px] text-subtle">
        {site.version} · built by {site.developer}
      </p>

      <h1
        id="hero-title"
        className="mt-7 text-[clamp(2.9rem,13vw,8.5rem)] leading-[0.95] font-black tracking-tighter"
      >
        {LINES.map((line, i) => (
          <span key={line} className={i === 1 ? "block text-glow-strong" : "block"}>
            <RevealWords text={line} start={LINE_STARTS[i]!} />
            {i < LINES.length - 1 ? " " : null}
          </span>
        ))}
      </h1>

      <p
        className="mt-7 max-w-xl animate-fade-up text-base leading-relaxed text-pretty text-muted sm:text-lg"
        style={{ animationDelay: "450ms" }}
      >
        One quiet place for code, files and hard questions. Answers stream as they are written.
      </p>

      <div
        className="mt-10 flex w-full max-w-sm animate-fade-up flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row"
        style={{ animationDelay: "600ms" }}
      >
        <Magnetic>
          <ButtonLink href="/app" size="lg" className="w-full">
            Start chatting <ArrowRight weight="bold" aria-hidden />
          </ButtonLink>
        </Magnetic>
        <Magnetic>
          <ButtonLink href="#demo" variant="secondary" size="lg" className="w-full">
            Try the live demo
          </ButtonLink>
        </Magnetic>
      </div>

      <a
        href="#skills"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 rounded-xl p-2 text-subtle transition-colors duration-300 hover:text-fg [@media(min-width:640px)_and_(min-height:880px)]:flex"
        aria-label="Scroll to skills"
      >
        <span className="font-mono text-[10px] font-bold tracking-[0.3em] uppercase">Scroll</span>
        <span className="relative h-10 w-px overflow-hidden bg-line">
          <span className="scroll-hint absolute inset-0 bg-fg" />
        </span>
        <ArrowDown weight="bold" className="sr-only" aria-hidden />
      </a>
    </section>
  );
}
