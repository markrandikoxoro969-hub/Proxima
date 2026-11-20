import {
  Bug,
  CodeBlock,
  Database,
  GitBranch,
  Microphone,
  Paperclip,
} from "@phosphor-icons/react/ssr";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { SectionHeading } from "./magnetic";

const CAPABILITIES = [
  {
    icon: Bug,
    title: "Debugging",
    text: "Paste the error and the file. Proxima finds the cause and patches it.",
    tag: "Stack traces · edge cases",
  },
  {
    icon: CodeBlock,
    title: "Code review",
    text: "Reads your diff like a senior reviewer: naming, safety, missing tests.",
    tag: "Python · TypeScript · SQL",
  },
  {
    icon: GitBranch,
    title: "Refactors",
    text: "Turns one 200-line function into five you can actually name.",
    tag: "Small steps · no behaviour change",
  },
  {
    icon: Database,
    title: "Data modelling",
    text: "Designs schemas and queries that still make sense a year later.",
    tag: "Postgres · Prisma · indexes",
  },
  {
    icon: Microphone,
    title: "Voice input",
    text: "Speak the question on your phone. Edit it, then send.",
    tag: "Hands-free",
  },
  {
    icon: Paperclip,
    title: "File context",
    text: "Attach up to three text files and ask about your actual code.",
    tag: "100 KB each · never stored",
  },
];

export function Skills() {
  return (
    <section id="skills" aria-labelledby="skills-title" className="px-5 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        id="skills-title"
        eyebrow="Capabilities"
        title="Six things, done well."
        text="No feature grid. These are the jobs PROXIMA is actually good at."
      />
      <Stagger className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, text, tag }) => (
          <StaggerItem key={title}>
            <article className="group spotlight flex h-full flex-col rounded-3xl glass-solid p-6 transition-[transform,border-color,box-shadow] duration-500 ease-premium hover:-translate-y-1 hover:border-line-strong hover:shadow-glow sm:p-7">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-line bg-surface-hover transition-transform duration-500 ease-premium group-hover:scale-105">
                <Icon weight="bold" className="size-6" aria-hidden />
              </div>
              <h3 className="mt-6 text-xl font-black tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
              <p className="mt-5 font-mono text-[11px] font-semibold text-subtle">{tag}</p>
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
