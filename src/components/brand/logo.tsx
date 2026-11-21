import { Planet } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/** PROXIMA planet + wordmark. Links home by default. */
export function Logo({ className, href = "/" }: { className?: string; href?: string | null }) {
  const content = (
    <>
      <Planet weight="fill" className="size-7 shrink-0" aria-hidden />
      {/* Keep narrow-phone headers clear; the icon is enough until there is room for the wordmark. */}
      <span className="hidden text-lg font-extrabold tracking-[0.2em] min-[480px]:inline">{site.name}</span>
    </>
  );
  const classes = cn("inline-flex shrink-0 items-center gap-2.5", className);
  if (href === null) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={cn(classes, "tap rounded-xl")} aria-label={`${site.name} home`}>
      {content}
    </Link>
  );
}
