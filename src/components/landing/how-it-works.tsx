import { ChatCircleText, GoogleLogo, UserCircle } from "@phosphor-icons/react/ssr";
import { SectionHeading } from "./magnetic";

const STEPS = [
  {
    icon: GoogleLogo,
    title: "Sign in with Google",
    text: "One tap. No new password to remember.",
  },
  {
    icon: UserCircle,
    title: "Tell Proxima about you",
    text: "Your name and age, so answers fit you. Takes ten seconds.",
  },
  {
    icon: ChatCircleText,
    title: "Ask anything",
    text: "Replies stream in live. Every chat is saved to your account, on every device.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="cv-auto px-5 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        id="how-title"
        eyebrow="How it works"
        title="Ready in three steps."
        text="From landing here to your first answer in under a minute."
      />
      <div className="relative mx-auto mt-16 max-w-5xl">
        {/* Connecting line (desktop) */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-7 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block"
        />
        <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              data-reveal
              style={{ "--d": `${i * 120}ms` } as React.CSSProperties}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative flex size-14 items-center justify-center rounded-2xl bg-inverse text-on-inverse shadow-sm">
                <Icon weight="bold" className="size-7" aria-hidden />
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-line bg-surface-solid font-mono text-[10px] font-bold text-fg">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-black tracking-tight">{title}</h3>
              <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
