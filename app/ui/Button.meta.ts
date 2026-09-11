import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Any clickable action: form submits, dialog confirm/cancel, inline edits.",
    "One `primary` per section at most — the single most important action (see DESIGN.md button hierarchy).",
    "`destructive` for delete/revoke actions that deserve a solid button.",
    "`tertiary` + `tone=\"danger\"` for inline low-emphasis destructive actions (Revoke, Remove) that sit in a row or table.",
    "Async actions: pass `loading` — it handles the spinner, aria-busy, disabling and width preservation for you.",
  ],
  dontUseWhen: [
    "Icon-only actions — use IconButton.",
    "Menu/dropdown triggers — use MenuTriggerButton (app/ui/Menu).",
    "Navigation to another page — use a link styled as text, not a button.",
    "The raw `.text-btn` classes in ContactsPanel / PortalDrawer / ActionsTab / MeetingsTab are Phase 7 retrofit targets onto `tertiary` (`tone=\"danger\"` for Revoke); do not add new ones.",
  ],
  a11y: [
    "Renders a native <button type=\"button\"> — keyboard and screen-reader behaviour come free; don't override `type` to submit unless it's in a form.",
    "Focus ring via the shared .btn-* focus-visible rule (globals.css).",
    "`loading` sets aria-busy and disables interaction; the label stays in the DOM (invisible) so width is preserved.",
  ],
  tokens: ["action ramp", "danger ramp", "surface", "buttonSecondaryBorder", "focusRing"],
};
