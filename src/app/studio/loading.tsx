import { Spinner } from "@/components/ui/spinner";

/** Shown instantly while the Image Studio loads. */
export default function StudioLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-muted">
      <Spinner className="size-8" label="Loading image studio" />
      <p className="text-xs font-bold tracking-[0.3em] uppercase">Loading studio…</p>
    </div>
  );
}
