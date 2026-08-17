import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * cn — class combiner for DS components.
 *
 * clsx handles conditionals/arrays; tailwind-merge resolves Tailwind
 * conflicts so a caller-supplied utility (e.g. `font-normal`) beats a
 * component default (`font-semibold`) regardless of order.
 *
 * TWO HONEST LIMITS (peer review, 2026-08-11):
 *
 * 1. Custom classes whose names look like Tailwind utilities get EATEN.
 *    tailwind-merge classified `.text-btn` / `.text-btn-action` /
 *    `.text-btn-danger` as competing text-COLOUR utilities and kept only the
 *    last — a live rendering bug in Button's text variant. The registration
 *    below puts each in its own single-member group so they pass through
 *    and never conflict with anything. ANY future custom class starting
 *    with a utility prefix (text-, bg-, border-, p-, m-, …) is the same
 *    landmine: either name it away from the namespace (.btn-*) or register
 *    it here. cn.test.js pins this.
 *
 * 2. Caller utilities only beat defaults CARRIED BY UTILITIES. Properties
 *    set by the unlayered `.btn-*`/`.icon-btn` classes (backgrounds etc.)
 *    beat any Tailwind utility a caller passes, because unlayered CSS wins
 *    over @layer utilities. Overriding those requires a variant, not a
 *    className.
 */
const twMerge = extendTailwindMerge<
  "vector.text-btn" | "vector.text-btn-action" | "vector.text-btn-danger"
>({
  extend: {
    classGroups: {
      // One group per class: registered (so the colour-group matcher never
      // claims them) but never conflicting with each other.
      "vector.text-btn": ["text-btn"],
      "vector.text-btn-action": ["text-btn-action"],
      "vector.text-btn-danger": ["text-btn-danger"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
