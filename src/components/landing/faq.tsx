import { Plus } from "@phosphor-icons/react/ssr";
import { LIMITS } from "@/lib/limits";
import { site } from "@/lib/site";
import { SectionHeading } from "./magnetic";

export const FAQS = [
  {
    q: "What is Proxima?",
    a: `${site.shortName} is a private AI assistant for code, files and long questions. You type; it answers in plain language, live.`,
  },
  {
    q: "Do I need an account?",
    a: "Not to try it — the live demo above works without signing in (it isn’t saved). To keep your chats, attach files and use voice input, sign in with Google. It takes one tap.",
  },
  {
    q: "Are my chats private?",
    a: "Your chats are stored in a secure database linked only to your account. Nobody else can open them. You can export or delete any chat — or all of them — at any time from the app.",
  },
  {
    q: "Which files can I attach?",
    a: `Text and code files like .txt, .md, .py, .js, .json or .csv — up to ${LIMITS.attachmentsMax} files per message, ${Math.round(LIMITS.attachmentBytesMax / 1024)} KB each. Proxima reads the contents and answers about them.`,
  },
  {
    q: "Does voice input work on my phone?",
    a: "Yes, in browsers that support speech recognition — Chrome and Edge on Android and computers, and Safari on iPhone. Tap the mic, speak, and your words appear in the message box.",
  },
  {
    q: "Why is the first reply sometimes slow?",
    a: "When nobody has used Proxima for a while, its engine sleeps to save resources. Waking it can take up to a minute; after that, replies are quick. NVIDIA answers first, and a second engine takes over automatically if it fails.",
  },
  {
    q: "Who built Proxima?",
    a: `${site.shortName} (${site.version}) was designed and built by ${site.developer}.`,
  },
];

/** Accessible accordion using native <details> — works even without JavaScript. */
export function Faq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section id="faq" aria-labelledby="faq-title" className="px-5 py-24 sm:px-8 sm:py-32">
      <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered." />
      <div className="mx-auto mt-14 flex max-w-3xl flex-col gap-3">
        {FAQS.map((f, i) => (
          <details
            key={f.q}
            name="faq"
            data-reveal
            style={{ "--d": `${Math.min(i, 4) * 60}ms` } as React.CSSProperties}
            className="faq group rounded-3xl glass-solid transition-[border-color] duration-300 open:border-line-strong"
          >
            <summary className="flex tap cursor-pointer items-center justify-between gap-4 rounded-3xl px-5 py-4 text-left text-[15px] font-extrabold sm:px-6 sm:py-5 sm:text-base">
              {f.q}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line transition-colors duration-300 group-hover:bg-surface-hover">
                <Plus weight="bold" className="faq-icon size-4" aria-hidden />
              </span>
            </summary>
            <p className="faq-body px-5 pb-5 text-[15px] leading-relaxed text-muted sm:px-6 sm:pb-6">{f.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        // Static text from this file only (no user input) — safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </section>
  );
}
