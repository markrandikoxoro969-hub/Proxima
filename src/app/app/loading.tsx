import { Spinner } from "@/components/ui/spinner";

/** Shown instantly while the app page loads on the server. */
export default function AppLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-muted">
      <Spinner className="size-8" label="Loading PROXIMA" />
      <p className="text-xs font-bold tracking-[0.3em] uppercase">Preparing Proxima…</p>
    </div>
  );
}
