import { cn } from "@/lib/cn";

/**
 * Magnetic hover (desktop): the outer span stays still and its child follows
 * the mouse a little. The movement itself is done by <LandingEffects />, so
 * this stays a server component (no JavaScript of its own).
 */
export function Magnetic({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span data-magnetic className={className}>
      <span className="inline-flex w-full">{children}</span>
    </span>
  );
}

/** Small reusable heading block for landing sections. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  text,
  className,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  text?: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-reveal className={cn("mx-auto max-w-2xl text-center", className)}>
      <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-subtle uppercase">{eyebrow}</p>
      <h2
        id={id}
        className="vblur mt-4 text-4xl leading-[1.05] font-black tracking-tight text-balance sm:text-5xl"
      >
        {title}
      </h2>
      {text && <p className="mt-5 text-base leading-relaxed text-pretty text-muted sm:text-lg">{text}</p>}
    </div>
  );
}
