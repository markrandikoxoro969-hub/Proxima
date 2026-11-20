import { SimpleShell } from "@/components/layout/simple-shell";
import { formatLegalDate } from "@/lib/legal";

/** Shared layout for the Privacy Policy and Terms pages (static, no JavaScript needed). */
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SimpleShell>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-8 sm:px-6 sm:pt-14">
        <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-subtle uppercase">Legal</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-subtle">
          Last updated <time dateTime={updated}>{formatLegalDate(updated)}</time>
        </p>
        <div className="mt-8 rounded-3xl glass-solid p-5 text-sm leading-relaxed sm:p-6">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-subtle uppercase">In short</p>
          {summary}
        </div>
        <article className="legal mt-4">{children}</article>
      </main>
    </SimpleShell>
  );
}
