import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about our custom utilities so it de-duplicates them.
const twMerge = extendTailwindMerge<"surface">({
  extend: {
    classGroups: {
      surface: ["glass", "glass-solid"],
    },
  },
});

/** Combine class names and resolve Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
