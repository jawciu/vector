import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Inline field selectors in a form row (CreateTaskModal): due date, priority, status, owner — the pill is the trigger, a CalendarDropdown/MenuList opens beneath it.",
    "Rows of equal-width fields — it is flex-1, so siblings in the same flex row share the width evenly.",
    "Pass `active` while the pill's dropdown is open: it holds the surfaceHover background so the trigger reads as pressed for the dropdown's lifetime.",
    "`children` for real content (value text, clear button — see CreateTaskModal's PillClearButton pattern); `label` is only the muted empty-state fallback.",
  ],
  dontUseWhen: [
    "Drawer detail views — use FieldRow: borderless at rest, content-hugging, same API.",
    "Plain actions (submit, cancel, delete) — use Button/IconButton; FieldPill is a field trigger with a value, not an action.",
    "Menu triggers outside a field context — use MenuTriggerButton (app/components/Menu.js until Phase 5 moves it).",
  ],
  a11y: [
    "KNOWN GAP (lens 3, ranked #5): renders a <div onClick> — not focusable, not keyboard operable, no role, no focus-visible style. The drawer/modal field editors are mouse-only today. Phase 5 converts it to a native button; do not patch tabIndex/keydown per call site meanwhile.",
    "Hover and active states are CSS-driven (.field-pill / [data-active]) so they stay consistent across every call site.",
  ],
  tokens: ["bgElevated", "bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted"],
};
