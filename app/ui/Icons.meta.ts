import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "ANY icon in product UI — the 2026-08-11 sweep harvested the real product glyphs (tabs, task cards, drawers, sidebar nav, menus, chevrons, checks, bell, search, filter/sort, close) into this registry; check here before drawing anything.",
    "Field/property icons in task UI — the calendar, status, owner, assignee, members and dependencies rows in drawers, cards and field pills all pull from this registry.",
    "`PriorityIcon` wherever a task priority is displayed — it owns the low/medium/high bar colouring; never re-derive those colours at a call site.",
    "Adding a NEW shared icon: add it here (`currentColor` strokes/fills, `className`/`style`/`size` props, aria-hidden) AND add it to `GENERIC_ICONS` so the Storybook grid picks it up.",
  ],
  dontUseWhen: [
    "Hand-rolling a new inline SVG in feature code — that is the exact anti-pattern the sweep exists to end. If the glyph is missing, add it to the registry first, then import it; DS-PLAN Phases 7/8 migrate the remaining scattered call-site copies.",
    "The AI sparkle — use `Sparkle` (app/ui/Sparkle.tsx, the gradient mark), not a registry icon; it is co-presented in the icon story via `AI_ICONS` but stays its own module. `SparkleMonoIcon` is only for the sidebar Actions nav.",
    "Colour variants of an icon — they don't exist. Icons carry no colour of their own: everything renders in `currentColor` and inherits from the parent's text colour (see the InheritedColor story). Colour the container, never fork the icon.",
  ],
  a11y: [
    "Every icon renders `aria-hidden` — they are decorative and MUST be accompanied by visible or sr-only text; an icon never carries meaning alone.",
    "Colour comes from `currentColor` inherited from the parent. (Legacy note: the original 7 field icons bake `var(--text-muted)` as an inline-style default — kept for their call sites; sweep icons are pure currentColor.) `PriorityIcon` is the exception — it colours its bars from tokens directly, so priority is also conveyed by the adjacent label, not the bars alone. `TrendArrowIcon` is the other prop-driven glyph: one arrow rotated by `direction`, and the pill that uses it always names the direction in text too.",
    "Hardcoded hexes found during the sweep were converted to `currentColor` (the checked-checkbox tick was hardcoded to the action lilac); no raw colours live in the registry.",
  ],
  tokens: ["textMuted", "iconTertiary", "action"],
};
