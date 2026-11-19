import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "icon";

const base =
  "tap inline-flex select-none items-center justify-center gap-2 rounded-2xl font-extrabold tracking-wide " +
  // Only cheap properties are transitioned (never `transition: all`).
  "transition-[transform,background-color,color,box-shadow,opacity] duration-300 ease-premium " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-inverse text-on-inverse shadow-glow hover:shadow-glow-strong hover:scale-[1.01]",
  secondary: "border border-line bg-surface-hover text-fg hover:border-line-strong hover:bg-surface",
  ghost: "text-muted hover:bg-surface-hover hover:text-fg",
  danger: "border border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
};

const sizes: Record<Size, string> = {
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-4 text-sm sm:text-base",
  icon: "p-2.5",
};

type StyleProps = { variant?: Variant; size?: Size };

export function buttonClasses({ variant = "primary", size = "md" }: StyleProps = {}, className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={buttonClasses({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClasses({ variant, size }, className)} {...props} />;
}
