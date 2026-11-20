"use client";

import { ArrowLeft, ArrowRight, Check, File, Microphone, Planet } from "@phosphor-icons/react";
import useEmblaCarousel from "embla-carousel-react";
import { m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Full-screen feature slides.
 *  - Swipe (touch), drag (mouse), ← → keys, or the buttons/dots.
 *  - The incoming slide goes blur → sharp; the outgoing one softens away.
 *  - Arrow keys work when the slides fill most of the screen (or have focus),
 *    but never while you're typing somewhere.
 */
type Slide = { kicker: string; title: string; text: string; visual: React.ReactNode };

const SLIDES: Slide[] = [
  {
    kicker: "Code",
    title: "Code that holds up.",
    text: "Ask for a script, paste an error, or request a review. Code arrives highlighted and ready to copy.",
    visual: <CodeVisual />,
  },
  {
    kicker: "Answers",
    title: "Hard ideas, made plain.",
    text: "Ask for the short version, then go deeper one question at a time.",
    visual: <ChatVisual />,
  },
  {
    kicker: "Voice",
    title: "Talk. Don’t type.",
    text: "Tap the mic and speak naturally. Your words land in the message box, ready to send.",
    visual: <VoiceVisual />,
  },
  {
    kicker: "Files",
    title: "Bring your files.",
    text: "Attach up to three text or code files. Proxima reads them and answers about your actual work.",
    visual: <FilesVisual />,
  },
  {
    kicker: "Everywhere",
    title: "Your chats, everywhere.",
    text: "Sign in once. Conversations sync to your account; rename, export or delete them any time.",
    visual: <DevicesVisual />,
  },
];

export function Slides() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ duration: 34 });
  const [selected, setSelected] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect).on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect).off("reInit", onSelect);
    };
  }, [emblaApi]);

  const go = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);
  const prev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const next = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Keyboard: ← → (Home/End when focused inside).
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !emblaApi) return;
    let mostlyVisible = false;
    const io = new IntersectionObserver(
      ([entry]) => (mostlyVisible = (entry?.intersectionRatio ?? 0) >= 0.6),
      {
        threshold: [0, 0.6, 1],
      },
    );
    io.observe(section);

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const inside = target ? section.contains(target) : false;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      const pageLevel = !target || target === document.body;
      if (!inside && !(mostlyVisible && pageLevel && !typing)) return;

      if (e.key === "ArrowRight") emblaApi.scrollNext();
      else if (e.key === "ArrowLeft") emblaApi.scrollPrev();
      else if (inside && e.key === "Home") emblaApi.scrollTo(0);
      else if (inside && e.key === "End") emblaApi.scrollTo(SLIDES.length - 1);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      io.disconnect();
      document.removeEventListener("keydown", onKey);
    };
  }, [emblaApi]);

  const current = SLIDES[selected] ?? SLIDES[0]!;

  return (
    <section
      ref={sectionRef}
      id="features"
      aria-roledescription="carousel"
      aria-label="What Proxima can do"
      className="relative flex h-dvh min-h-[640px] flex-col overflow-hidden border-y border-line bg-surface-solid pt-24 pb-safe"
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Slide {selected + 1} of {SLIDES.length}: {current.kicker}
      </p>

      <div ref={emblaRef} className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full touch-pan-y">
          {SLIDES.map((slide, i) => {
            const active = i === selected;
            return (
              <div
                key={slide.kicker}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}: ${slide.kicker}`}
                inert={!active || undefined}
                className="h-full min-w-0 flex-[0_0_100%]"
              >
                <div
                  className={cn(
                    "mx-auto grid h-full max-w-6xl content-center items-center gap-8 px-5 transition-[opacity,filter,transform] duration-700 ease-premium sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16",
                    active
                      ? "scale-100 opacity-100 blur-none"
                      : "scale-[0.94] opacity-20 blur-[6px] md:blur-[12px]",
                  )}
                >
                  <div className="text-center lg:text-left">
                    <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-subtle uppercase">
                      {String(i + 1).padStart(2, "0")} — {slide.kicker}
                    </p>
                    <h2 className="mt-4 text-[clamp(2.2rem,8vw,4.75rem)] leading-[0.98] font-black tracking-tighter text-balance">
                      {slide.title}
                    </h2>
                    <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-pretty text-muted sm:text-lg lg:mx-0">
                      {slide.text}
                    </p>
                  </div>
                  <div className="mx-auto w-full max-w-md">{slide.visual}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7">
        <p className="font-mono text-xs font-bold tracking-[0.2em] text-subtle tabular-nums" aria-hidden>
          <span className="text-fg">{String(selected + 1).padStart(2, "0")}</span> /{" "}
          {String(SLIDES.length).padStart(2, "0")}
        </p>

        <div className="hidden items-center sm:flex" role="group" aria-label="Choose slide">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.kicker}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}: ${slide.kicker}`}
              aria-current={i === selected ? "true" : undefined}
              className="group flex size-11 items-center justify-center"
            >
              <span className="relative flex size-2 items-center justify-center">
                {i === selected && (
                  <m.span
                    layoutId="slide-dot"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-full bg-fg"
                  />
                )}
                <span
                  className={cn(
                    "size-2 rounded-full bg-fg transition-opacity duration-300",
                    i === selected ? "opacity-0" : "opacity-25 group-hover:opacity-60",
                  )}
                />
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-2 hidden font-mono text-[10px] font-bold tracking-[0.2em] text-subtle uppercase lg:inline">
            Swipe or arrow keys
          </span>
          <button
            type="button"
            onClick={prev}
            disabled={selected === 0}
            aria-label="Previous slide"
            className="flex size-11 items-center justify-center rounded-full border border-line text-fg transition-[background-color,opacity,transform] duration-300 ease-premium hover:bg-surface-hover active:scale-95 disabled:opacity-30"
          >
            <ArrowLeft weight="bold" className="size-4.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={selected === SLIDES.length - 1}
            aria-label="Next slide"
            className="flex size-11 items-center justify-center rounded-full bg-inverse text-on-inverse transition-[opacity,transform] duration-300 ease-premium active:scale-95 disabled:opacity-30"
          >
            <ArrowRight weight="bold" className="size-4.5" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Slide visuals (pure CSS shapes — no images to download) ---------- */

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-bg shadow-glow">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-subtle uppercase">
          {title}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CodeVisual() {
  return (
    <Window title="python">
      <pre className="overflow-hidden font-mono text-[12px] leading-relaxed sm:text-[13px]" aria-hidden>
        <code>
          <span className="token keyword">def</span> <span className="token function">greet</span>
          <span className="token punctuation">(</span>name<span className="token punctuation">:</span>{" "}
          <span className="token builtin">str</span>
          <span className="token punctuation">):</span>
          {"\n    "}
          <span className="token keyword">return</span>{" "}
          <span className="token string">
            f&quot;Hello, {"{"}name{"}"}!&quot;
          </span>
          {"\n\n"}
          <span className="token keyword">for</span> person <span className="token keyword">in</span>{" "}
          <span className="token punctuation">[</span>
          <span className="token string">&quot;Sujan&quot;</span>
          <span className="token punctuation">,</span> <span className="token string">&quot;You&quot;</span>
          <span className="token punctuation">]:</span>
          {"\n    "}
          <span className="token function">print</span>
          <span className="token punctuation">(</span>
          <span className="token function">greet</span>
          <span className="token punctuation">(</span>person<span className="token punctuation">))</span>
        </code>
      </pre>
      <div className="mt-5 flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[11px] font-bold text-muted">
          <Check weight="bold" className="size-3.5" /> Copied
        </span>
      </div>
    </Window>
  );
}

function ChatVisual() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="ml-auto max-w-[80%] rounded-3xl rounded-br-lg bg-inverse px-4 py-3 text-sm font-semibold text-on-inverse">
        Explain quantum physics simply
      </div>
      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-line bg-bg">
          <Planet weight="fill" className="size-4" />
        </span>
        <div className="rounded-3xl rounded-tl-lg border border-line bg-bg px-4 py-3 text-sm leading-relaxed text-muted">
          Imagine a coin spinning in the air — it’s not heads <em>or</em> tails yet, it’s a bit of both. Tiny
          particles behave like that until we look
          <span className="stream-caret" />
        </div>
      </div>
    </div>
  );
}

function VoiceVisual() {
  return (
    <div className="flex flex-col items-center gap-8" aria-hidden>
      <div className="relative flex size-28 items-center justify-center rounded-full bg-inverse text-on-inverse shadow-glow-strong">
        <span className="absolute inset-0 animate-ping rounded-full border border-fg/30" />
        <Microphone weight="fill" className="size-10" />
      </div>
      <div className="flex h-16 items-center gap-1.5">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="wave-bar w-1.5 rounded-full bg-fg"
            style={{ "--i": i, height: `${30 + ((i * 37) % 70)}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <p className="font-mono text-xs font-bold tracking-[0.2em] text-subtle uppercase">Listening…</p>
    </div>
  );
}

function FilesVisual() {
  const files = [
    { name: "app.py", size: "2.1 KB" },
    { name: "notes.md", size: "6.4 KB" },
    { name: "data.json", size: "12 KB" },
  ];
  return (
    <Window title="attach">
      <ul className="flex flex-col gap-2.5" aria-hidden>
        {files.map((f, i) => (
          <li
            key={f.name}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-hover px-4 py-3"
            style={{ marginLeft: `${i * 14}px` }}
          >
            <File weight="bold" className="size-5 shrink-0" />
            <span className="flex-1 truncate text-sm font-bold">{f.name}</span>
            <span className="font-mono text-[11px] text-subtle">{f.size}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
        “Review <span className="font-mono text-fg">app.py</span> and find the bug.”
      </p>
    </Window>
  );
}

function DevicesVisual() {
  return (
    <div className="relative mx-auto h-72 w-full max-w-sm" aria-hidden>
      <div className="absolute inset-x-0 top-0 h-56 rounded-3xl border border-line bg-bg p-4 shadow-glow">
        <div className="flex h-full gap-3">
          <div className="flex w-1/3 flex-col gap-2 border-r border-line pr-3">
            <span className="h-6 rounded-lg bg-inverse" />
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-4 rounded-md bg-surface-hover" />
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <span className="ml-auto h-6 w-2/3 rounded-xl bg-inverse" />
            <span className="h-4 w-full rounded-md bg-surface-hover" />
            <span className="h-4 w-5/6 rounded-md bg-surface-hover" />
            <span className="h-4 w-4/6 rounded-md bg-surface-hover" />
          </div>
        </div>
      </div>
      <div className="absolute right-2 bottom-0 h-44 w-24 rounded-[1.75rem] border border-line-strong bg-bg p-2.5 shadow-glow-strong">
        <div className="flex h-full flex-col gap-1.5">
          <span className="mx-auto mb-1 h-1 w-8 rounded-full bg-line-strong" />
          <span className="ml-auto h-4 w-3/4 rounded-lg bg-inverse" />
          <span className="h-3 w-full rounded bg-surface-hover" />
          <span className="h-3 w-4/5 rounded bg-surface-hover" />
          <span className="mt-auto h-5 rounded-full border border-line" />
        </div>
      </div>
    </div>
  );
}
