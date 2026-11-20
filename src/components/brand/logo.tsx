import { Planet } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/** PROXIMA planet + wordmark. Links home by default. */
export function Logo({ className, href = "/" }: { className?: string; href?: string | null }) {
  const content = (
    <>
      <Planet weight="fill" className="size-7 shrink-0" aria-hidden />
      {/* On a 320px phone the full wordmark pushes the header buttons off-screen. */}
      <span className="hidden text-lg font-extrabold tracking-[0.2em] min-[350px]:inline">{site.name}</span>
    </>
  );
  const classes = cn("inline-flex items-center gap-2.5", className);
  if (href === null) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={cn(classes, "tap rounded-xl")} aria-label={`${site.name} home`}>
      {content}
    </Link>
  );
}
