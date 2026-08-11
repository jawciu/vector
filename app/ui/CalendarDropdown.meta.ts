import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Picking a single date on a field row (task target date, meeting date, draft due date) — TaskDrawer, CreateTaskModal, CreateOnboardingModal, MeetingsTab and AIDraftInbox all use it.",
    "Render it INSIDE a `position: relative` anchor (it positions itself `absolute left-0 top-full`), conditionally on your own `open` state.",
    "It is fully controlled: `value` (YYYY-MM-DD string or \"\"), `viewDate` + `onViewDateChange` (Date driving the visible month), `onChange`, `onClear`, `onClose` (fired on outside mousedown).",
  ],
  dontUseWhen: [
    "Free-text or partial date entry — this is pick-only.",
    "Date RANGES — not supported; don't fake it with two instances in one popover.",
    "Generic option pickers — use MenuList + MenuOption; this component is bespoke to the calendar grid.",
  ],
  a11y: [
    "Day cells and footer actions are real `<button type=\"button\">`s, so they are individually focusable and Enter/Space-clickable.",
    "FIXED (was a Lens 3 gap and a critical axe hit): the month chevrons carry `aria-label=\"Previous month\"` / `\"Next month\"` (icons aria-hidden), so they are announced and selectable by name — the MonthNavigation story selects them that way.",
    "HONEST GAPS (audit Lens 3 — documented, not yet fixed): no `role=\"grid\"`/dialog semantics, no arrow-key navigation between days, no ESC-to-close (outside click only), and hover styles are applied by JS mutation rather than CSS.",
    "\"Today\" is marked by a border ring only — visual, not announced.",
  ],
  tokens: ["bgElevated", "border", "shadowFloating", "action", "actionText", "surfaceHover", "iconTertiary", "textMuted"],
};
