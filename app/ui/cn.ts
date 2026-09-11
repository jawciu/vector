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
 *    tailwind-merge classified the old `.text-btn*` classes as competing
 *    text-COLOUR utilities and kept only the last, a live rendering bug
 *    until they were registered here. Those classes are gone (slice 1), so
 *    nothing is registered today, but the mechanism stays: ANY future custom
 *    class starting with a utility prefix (text-, bg-, border-, p-, m-, …)
 *    is the same landmine. Either name it away from the namespace (.btn-*)
 *    or add it to `classGroups` below as its own single-member group.
 *    cn.test.js pins the pass-through of the .btn-* names.
 *
 * 2. Caller utilities only beat defaults CARRIED BY UTILITIES. Properties
 *    set by the unlayered `.btn-*`/`.icon-btn` classes (backgrounds etc.)
 *    beat any Tailwind utility a caller passes, because unlayered CSS wins
 *    over @layer utilities. Overriding those requires a variant, not a
 *    className.
 */
const twMerge = extendTailwindMerge({
  extend: {
    // One group per custom class that collides with a utility prefix:
    // registered (so the matcher never claims it) but never conflicting.
    classGroups: {},
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
