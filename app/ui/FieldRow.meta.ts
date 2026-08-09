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
    "KNOWN GAP (lens 3, ranked #5): renders a <div onClick> — not focusable, not keyboard operable, no role. The drawer's primary editors are mouse-only today. Phase 5 converts it to a native button; don't work around it per call site.",
    "The :focus-within style already lights the row when an inner focusable (e.g. clear button) has focus — that is the row's only keyboard affordance today.",
  ],
  tokens: ["bgHover", "surfaceHover", "buttonSecondaryBorder", "textMuted"],
};
