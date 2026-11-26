import { Spinner } from "@/components/ui/spinner";

/** Shown instantly while your saved memories load. */
export default function MemoryLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-muted">
      <Spinner className="size-8" label="Loading memory" />
      <p className="text-xs font-bold tracking-[0.3em] uppercase">Loading memory…</p>
    </div>
  );
}
