import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Field editors in drawer detail views (TaskDrawer: Target date, Status, Priority, Owner) — a quiet label+value row that opens a dropdown on click.",
    "Surfaces where a bordered pill per field would be visually noisy: at rest FieldRow is borderless and content-hugging (inline-flex), so a column of fields reads as text.",
    "Pass `active` while the row's dropdown is open — border + surfaceHover background appear only then (or on :focus-within).",
    "`children` for label+value content (muted label span, value span); `label` is the bare fallback.",
    "CONTAINER mode (no `onClick`): the row holds a text input or a read-only value instead of opening something. The main area renders as a plain <div>, the pressable hover fill and the pointer cursor are off, and `onClear` still works. `onClick` and an interactive child are MUTUALLY EXCLUSIVE: a row that holds an input is a container, not a trigger, and it will become the boxed TextField in slice 4.",
    "Pass `onClear` whenever the value can be removed: a Clear (X) appears over the row's right edge on hover, focus-within and while active, and clears without toggling the row. This is TaskDrawer's due-date row pattern, mirrored from FieldPill; do not hand-roll a clear button at the call site.",
  ],
  dontUseWhen: [
    "Form rows of equal-width fields — use FieldPill (bordered, flex-1).",
    "Nothing: a read-only label+value row is now the supported CONTAINER mode. Omit `onClick` and the row drops the pointer cursor, the pressable hover and the tab stop (PortalDrawer's customer-facing Target / Priority / Owner rows).",
    "Plain actions — use Button/IconButton.",
  ],
  a11y: [
    "TRIGGER mode announces its popup: `aria-haspopup` comes from `popup` (\"menu\" by default, \"dialog\" for a CalendarDropdown host, \"listbox\" for a value list) and `aria-expanded` mirrors `active` whenever `active` is a boolean, so the lit trigger and the announced state cannot disagree (DESIGN.md). Pass `active` on every trigger that opens something; leave it off only for a trigger that opens nothing.",
    "Never put an <input> (or any other interactive element) inside a row that has `onClick`. The HTML parser un-nests interactive content from a <button>, so it hydration-mismatches, and it is a keyboard trap risk. Drop `onClick` and the main area becomes a <div> that can legally hold the control.",
    "CONTAINER mode has no tab stop of its own, which is correct for a read-only row; when it holds an input, that input is the tab stop and :focus-within lights the row.",
    "TRIGGER mode: the main control is a native <button type=\"button\"> (peer-review item 12 closed): Tab reaches it, Enter/Space activate it, :focus-visible draws the shared 2px focus-ring outline, and its accessible name is the icon-plus-text content. The wrapper div is non-interactive and only carries the box and states. Don't add per-call-site tabIndex/keydown workarounds.",
    "The Clear (X) is a second native <button aria-label=\"Clear\">, a sibling after the main control, never nested inside it, so axe's nested-interactive rule passes. It is display:none at rest (no reserved space) and shown while the row is hovered, focused within, or active: Tab to the main control reveals it, the next Tab reaches it, Enter/Space clear. No motion, so reduced-motion is unaffected.",
  ],
  tokens: ["bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted", "text", "focusRing"],
};
