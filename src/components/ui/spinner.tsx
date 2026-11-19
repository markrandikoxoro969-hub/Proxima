import { cn } from "@/lib/cn";

/** Small loading circle. Spins with transform only (GPU-cheap). */
export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-block size-4", className)}>
      <span className="block size-full animate-spin rounded-full border-2 border-current border-t-transparent" />
    </span>
  );
}
