/** A lightweight, accessible fallback while the signed-in catalog loads. */
export default function SkillsLoading() {
  return (
    <div className="px-safe min-h-dvh pt-safe pb-safe">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div
          aria-hidden
          className="h-7 w-32 animate-pulse rounded-lg bg-surface-hover motion-reduce:animate-none"
        />
        <div
          aria-hidden
          className="h-10 w-40 animate-pulse rounded-xl bg-surface-hover motion-reduce:animate-none"
        />
      </header>
      <main
        id="main"
        role="status"
        aria-label="Loading skills"
        className="mx-auto max-w-6xl px-4 pt-5 pb-16 sm:px-6 sm:pt-10"
      >
        <span className="sr-only">Loading skills and your installations…</span>
        <section aria-hidden className="mb-8 border-b border-line pb-7 sm:mb-9 sm:pb-8">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <div className="mt-4 h-10 w-64 max-w-full animate-pulse rounded-xl bg-surface-hover motion-reduce:animate-none" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <div className="mt-2 h-4 w-3/4 max-w-md animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
        </section>
        <div aria-hidden className="mb-5 flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-xl bg-surface-hover motion-reduce:animate-none" />
          <div className="h-10 w-32 animate-pulse rounded-xl bg-surface-hover motion-reduce:animate-none" />
        </div>
        <div aria-hidden className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="min-h-72 animate-pulse rounded-2xl border border-line bg-surface-solid motion-reduce:animate-none"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
