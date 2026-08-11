import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Single-line text entry: names, emails, titles, URLs — usually inside <Field>, which supplies the label and wiring.",
    "Anywhere a hand-rolled `<input style={{…}}>` exists today (Phase 7 retrofits them onto this).",
  ],
  dontUseWhen: [
    "Search fields with a magnifier icon — use the `.search-input` wrapper pattern until it's absorbed as an Input variant (Phase 7).",
    "Multi-line text — use Textarea.",
    "Picking from a fixed set — use Select, or MenuList for rich dropdowns.",
  ],
  a11y: [
    "Needs an accessible name: render inside <Field label=…> (preferred) or pass aria-label when standalone.",
    "`invalid` sets aria-invalid; an incoming aria-invalid (e.g. cloned in by Field's `error`) triggers the same danger border, so state and visuals can't drift apart.",
    "Placeholder is `textMuted` and never a substitute for a label.",
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
