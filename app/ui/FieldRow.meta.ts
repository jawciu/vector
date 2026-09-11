import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Field editors in drawer detail views (TaskDrawer: Target date, Status, Priority, Owner) — a quiet label+value row that opens a dropdown on click.",
    "Surfaces where a bordered pill per field would be visually noisy: at rest FieldRow is borderless and content-hugging (inline-flex), so a column of fields reads as text.",
    "Pass `active` while the row's dropdown is open — border + surfaceHover background appear only then (or on :focus-within).",
    "`children` for label+value content (muted label span, value span); `label` is the bare fallback.",
    "Pass `onClear` whenever the value can be removed: a Clear (X) appears over the row's right edge on hover, focus-within and while active, and clears without toggling the row. This is TaskDrawer's due-date row pattern, mirrored from FieldPill; do not hand-roll a clear button at the call site.",
  ],
  dontUseWhen: [
    "Form rows of equal-width fields — use FieldPill (bordered, flex-1).",
    "Read-only label+value display — this carries cursor-pointer and hover feedback; if nothing opens, it is lying to the user.",
    "Plain actions — use Button/IconButton.",
  ],
  a11y: [
    "The main control is a native <button type=\"button\"> (peer-review item 12 closed): Tab reaches it, Enter/Space activate it, :focus-visible draws the shared 2px focus-ring outline, and its accessible name is the icon-plus-text content. The wrapper div is non-interactive and only carries the box and states. Don't add per-call-site tabIndex/keydown workarounds.",
    "The Clear (X) is a second native <button aria-label=\"Clear\">, a sibling after the main control, never nested inside it, so axe's nested-interactive rule passes. It is display:none at rest (no reserved space) and shown while the row is hovered, focused within, or active: Tab to the main control reveals it, the next Tab reaches it, Enter/Space clear. No motion, so reduced-motion is unaffected.",
  ],
  tokens: ["bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted", "text", "focusRing"],
};
