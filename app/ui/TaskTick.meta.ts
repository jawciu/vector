import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Marking a task done / not done on task surfaces: kanban cards (TaskCardView's CheckboxButton is the source; Phase 7 retrofits it onto this), task rows, drawers.",
    "Read-only task surfaces too (e.g. InsightsPanel) — omit onChange and the tick renders inert.",
  ],
  dontUseWhen: [
    "Selection in dropdowns and pickers — that's Checkbox (square, `action`).",
    "Bulk-selecting AI inbox drafts — that circular idiom is `action`-coloured selection, not done-state; not absorbed yet.",
    "Anything that isn't completion — the `success` fill and bounce read specifically as \"done\".",
  ],
  a11y: [
    "aria-label is required by the props type; swap it with state (checked ? \"Mark as incomplete\" : \"Mark as done\" — the shipped wording).",
    "Toggle-button semantics: aria-pressed reflects `checked`; Space and Enter both activate (native button).",
    "The bounce is skipped under prefers-reduced-motion (checked in-component; the globals `checkboxBounce` keyframe itself is unguarded — noted, out of this component's scope).",
    "NEW (pending Caroline's review): focus-visible shows the standard `focusRing` outline — the shipped button had no keyboard focus style.",
  ],
  tokens: [
    "iconTertiary (unchecked ring + ghost check)",
    "success (hover + checked fill)",
    "focusRing (focus outline)",
    "rounded.full (circle)",
  ],
};
