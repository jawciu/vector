import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Field/property icons in task UI — the calendar, status, owner, assignee, members and dependencies rows in drawers, cards and field pills all pull from this registry.",
    "`PriorityIcon` wherever a task priority is displayed — it owns the low/medium/high bar colouring; never re-derive those colours at a call site.",
    "Adding a NEW shared icon: add it here (14×14 viewBox, `currentColor` strokes/fills, `className`/`style` props) so every surface picks it up.",
  ],
  dontUseWhen: [
    "New one-off inline SVGs in feature code — that's the ~112-scattered-SVG problem (audit Lens 2); DS-PLAN Phase 8 consolidates them INTO this registry, so put the icon here instead.",
    "The AI sparkle — use `Sparkle` (`app/ui/Sparkle.js`'s gradient mark), not a registry icon.",
    "Tiny 11–12px glyphs inside an `IconButton` — those follow IconButton's own inner-SVG convention.",
  ],
  a11y: [
    "Every icon renders `aria-hidden` — they are decorative and MUST be accompanied by visible or sr-only text; an icon never carries meaning alone.",
    "Colour comes from `currentColor` with `var(--text-muted)` baked in as the default (override via `style`); `PriorityIcon` is the exception — it colours its bars from tokens directly, so priority is also conveyed by the adjacent label, not the bars alone.",
  ],
  tokens: ["textMuted", "iconTertiary", "action"],
};
