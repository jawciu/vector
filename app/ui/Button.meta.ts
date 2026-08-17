import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Any clickable action: form submits, dialog confirm/cancel, inline edits.",
    "One `primary` per section at most — the single most important action (see DESIGN.md button hierarchy).",
    "`destructive` for delete/revoke actions; `text` (+ `tone`) for inline low-emphasis actions.",
    "Async actions: pass `loading` — it handles the spinner, aria-busy, disabling and width preservation for you.",
  ],
  dontUseWhen: [
    "Icon-only actions — use IconButton.",
    "Menu/dropdown triggers — use MenuTriggerButton (app/ui/Menu).",
    "Navigation to another page — use a link styled as text, not a button.",
  ],
  a11y: [
    "Renders a native <button type=\"button\"> — keyboard and screen-reader behaviour come free; don't override `type` to submit unless it's in a form.",
    "Focus ring via the shared .btn-* focus-visible rule (globals.css).",
    "`loading` sets aria-busy and disables interaction; the label stays in the DOM (invisible) so width is preserved.",
  ],
  tokens: ["action ramp", "danger ramp", "surface", "buttonSecondaryBorder", "focusRing"],
};
