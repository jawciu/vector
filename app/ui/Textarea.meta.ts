import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Multi-line text entry: descriptions, notes, meeting summaries — usually inside <Field>.",
    "Anywhere a hand-rolled `<textarea>` exists today (Phase 7 retrofits them onto this).",
  ],
  dontUseWhen: [
    "Single-line values — use Input.",
    "Rich text / markdown editing — nothing in the DS yet; don't fake it with a textarea and expect formatting.",
  ],
  a11y: [
    "Needs an accessible name: render inside <Field label=…> (preferred) or pass aria-label when standalone.",
    "`invalid` sets aria-invalid; an incoming aria-invalid (cloned in by Field's `error`) triggers the same danger border.",
    "User-resizable vertically only (resize: vertical), so resizing can't break the horizontal layout.",
  ],
  tokens: [
    "bg / bgHover (surfaces)",
    "border / buttonSecondaryBorder",
    "action (focus border)",
    "danger (invalid border)",
    "textMuted (placeholder)",
    "rounded.lg (8px)",
  ],
};
