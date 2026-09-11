import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Loading affordances outside a button: a panel waiting on a fetch, an inline wait next to text, a drawer section still hydrating.",
    "Anywhere you would otherwise hand-roll a spinning ring — this is the one spinner (same `.btn-spinner` visual Button has shipped since Phase 4).",
    "Tint by colour context: it spins in `currentColor`, so set `color` on a wrapper (e.g. `var(--text-muted)`) rather than adding a colour prop.",
  ],
  dontUseWhen: [
    "Inside a Button for an async action — pass Button's `loading` prop instead; it also handles aria-busy, disabling and width preservation.",
    "AI generation states — those use the `.ai-generating` / `.is-streaming` treatment (DESIGN.md), not a ring.",
    "Long multi-element loads where layout would jump — prefer skeleton/placeholder content; a lone ring gives no shape hint.",
  ],
  a11y: [
    "Pass `aria-label` to announce it: the span becomes `role=\"status\"` (polite live region). Without a label it renders `aria-hidden` — decorative, so the surrounding context must state that something is loading.",
    "Loading motion is essential status information: `prefers-reduced-motion` SLOWS the spin (2s) rather than freezing it into a static ring (globals.css).",
  ],
  tokens: ["currentColor (inherits text colour — no fixed token)"],
};
