import { Brain, Code, Lightbulb, Microphone, Paperclip, PencilSimple } from "@phosphor-icons/react/ssr";
import { SectionHeading } from "./magnetic";

const SKILLS = [
  {
    icon: Code,
    title: "Coding",
    text: "Write, explain and debug code in any language — with syntax colours and one-tap copy.",
    tag: "Python · JS · C++ · SQL",
  },
  {
    icon: Brain,
    title: "Learning",
    text: "Hard topics made simple, explained at your level. Ask follow-ups until it clicks.",
    tag: "Physics · History · Maths",
  },
  {
    icon: PencilSimple,
    title: "Writing",
    text: "Emails, essays, captions and stories. Draft, rewrite and polish in seconds.",
    tag: "Draft · Edit · Translate",
  },
  {
    icon: Lightbulb,
    title: "Brainstorming",
    text: "Stuck? Get fresh ideas for apps, projects, names and plans — then dig deeper.",
    tag: "Ideas on demand",
  },
  {
    icon: Microphone,
    title: "Voice",
    text: "Tap the mic and just talk. Your words appear in the message box, ready to send.",
    tag: "Hands-free",
  },
  {
    icon: Paperclip,
    title: "File help",
    text: "Attach text and code files (up to 100 KB) and ask Proxima to review or explain them.",
    tag: ".txt · .md · .py · .js …",
  },
];

export function Skills() {
  return (
    <section id="skills" aria-labelledby="skills-title" className="px-5 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        id="skills-title"
        eyebrow="Skills"
        title="One assistant. Six superpowers."
        text="Everything you used to open five tabs for — in one calm, fast conversation."
      />
      <ul className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {SKILLS.map(({ icon: Icon, title, text, tag }, i) => (
          <li key={title} data-reveal style={{ "--d": `${(i % 3) * 90}ms` } as React.CSSProperties}>
            <article className="group spotlight h-full rounded-3xl glass-solid p-6 transition-[transform,border-color,box-shadow] duration-500 ease-premium hover:-translate-y-1 hover:border-line-strong hover:shadow-glow sm:p-7">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-line bg-surface-hover transition-transform duration-500 ease-premium group-hover:scale-110">
                <Icon weight="bold" className="size-6" aria-hidden />
              </div>
              <h3 className="mt-6 text-xl font-black tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
              <p className="mt-5 font-mono text-[11px] font-bold tracking-[0.15em] text-subtle uppercase">
                {tag}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
