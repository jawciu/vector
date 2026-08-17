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
    "Menu triggers outside a field context — use MenuTriggerButton (app/ui/Menu).",
  ],
  a11y: [
    "FIXED (was Lens 3 gap #5, mouse-only field editors): when `onClick` is present the pill carries role=\"button\" + tabIndex=0, Enter and Space activate it (Space preventDefaults so the page doesn't scroll), and :focus-visible draws the shared 2px focus-ring outline. Without `onClick` it stays a plain non-interactive div.",
    "HONEST NOTE: it is still a <div> with a button role, not a native <button> — call-site layout (flex-1 pill rows) depends on the element. Don't add per-call-site tabIndex/keydown workarounds; the primitive owns the keyboard contract now.",
    "Keys originating on focusable children (e.g. a clear button inside) are ignored by the pill — the child handles its own activation.",
    "Hover and active states are CSS-driven (.field-pill / [data-active]) so they stay consistent across every call site.",
  ],
  tokens: ["bgElevated", "bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted", "focusRing"],
};
