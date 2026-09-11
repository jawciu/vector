import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Inline field selectors in a form row (CreateTaskModal): due date, priority, status, owner — the pill is the trigger, a CalendarDropdown/MenuList opens beneath it.",
    "Rows of equal-width fields — it is flex-1, so siblings in the same flex row share the width evenly.",
    "Pass `active` while the pill's dropdown is open: it holds the surfaceHover background so the trigger reads as pressed for the dropdown's lifetime.",
    "`children` for real content (the value text); `label` is only the muted empty-state fallback.",
    "Pass `onClear` whenever the value can be removed: a Clear (X) button appears at the right edge on hover, focus-within and while active, and clears without toggling the pill. This is the app's due-date / owner pill pattern; do not hand-roll a clear button at the call site.",
  ],
  dontUseWhen: [
    "Drawer detail views — use FieldRow: borderless at rest, content-hugging, same API.",
    "Plain actions (submit, cancel, delete) — use Button/IconButton; FieldPill is a field trigger with a value, not an action.",
    "Menu triggers outside a field context — use MenuTriggerButton (app/ui/Menu).",
  ],
  a11y: [
    "The main control is a native <button type=\"button\"> (peer-review item 12 closed): Tab reaches it, Enter/Space activate it, :focus-visible draws the shared 2px focus-ring outline, and its accessible name is the icon-plus-text content. The wrapper div is non-interactive and only carries the box and states. Don't add per-call-site tabIndex/keydown workarounds.",
    "The Clear (X) is a second native <button aria-label=\"Clear\">, a sibling after the main control, never nested inside it, so axe's nested-interactive rule passes. It is display:none at rest (no reserved space) and shown while the pill is hovered, focused within, or active: Tab to the main control reveals it, the next Tab reaches it, Enter/Space clear. No motion, so reduced-motion is unaffected.",
    "Hover and active states are CSS-driven on the wrapper (.field-pill / [data-active]) so they stay consistent across every call site and cover the X as well as the main control.",
  ],
  tokens: ["bgElevated", "bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted", "text", "focusRing"],
};
