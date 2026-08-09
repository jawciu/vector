import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — class combiner for DS components.
 *
 * clsx handles conditionals/arrays; twMerge resolves Tailwind conflicts so a
 * caller-supplied class (e.g. `font-normal`) beats a component default
 * (`font-semibold`) regardless of order. Custom classes (`btn-primary`,
 * `text-btn`) pass through untouched.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
