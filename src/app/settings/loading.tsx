import { Spinner } from "@/components/ui/spinner";

/** Shown instantly while your settings load. */
export default function SettingsLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-muted">
      <Spinner className="size-8" label="Loading settings" />
      <p className="text-xs font-bold tracking-[0.3em] uppercase">Loading settings…</p>
    </div>
  );
}
