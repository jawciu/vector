import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Field editors in drawer detail views (TaskDrawer: Target date, Status, Priority, Owner) — a quiet label+value row that opens a dropdown on click.",
    "Surfaces where a bordered pill per field would be visually noisy: at rest FieldRow is borderless and content-hugging (inline-flex), so a column of fields reads as text.",
    "Pass `active` while the row's dropdown is open — border + surfaceHover background appear only then (or on :focus-within, e.g. a clear button inside).",
    "`children` for label+value content (muted label span, value span, hover-revealed clear button — see TaskDrawer); `label` is the bare fallback.",
  ],
  dontUseWhen: [
    "Form rows of equal-width fields — use FieldPill (bordered, flex-1).",
    "Read-only label+value display — this carries cursor-pointer and hover feedback; if nothing opens, it is lying to the user.",
    "Plain actions — use Button/IconButton.",
  ],
  a11y: [
    "FIXED (was Lens 3 gap #5, mouse-only field editors): when `onClick` is present the row carries role=\"button\" + tabIndex=0, Enter and Space activate it (Space preventDefaults so the page doesn't scroll), and :focus-visible draws the shared 2px focus-ring outline. Without `onClick` it stays a plain non-interactive div.",
    "HONEST NOTE: it is still a <div> with a button role, not a native <button> — call-site layout (content-hugging inline-flex rows) depends on the element. Don't add per-call-site tabIndex/keydown workarounds; the primitive owns the keyboard contract now.",
    "Keys originating on focusable children are ignored by the row (the child handles its own activation), and the :focus-within style still lights the row when an inner focusable (e.g. clear button) has focus.",
  ],
  tokens: ["bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted", "focusRing"],
};
