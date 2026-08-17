import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Filtering a visible list as the user types: tab headers (Actions, Meetings), dropdown people-pickers — anywhere the shipped `.search-input` wrapper is hand-rolled today (Phase 7 retrofits them onto this).",
  ],
  dontUseWhen: [
    "Ordinary form values — use TextField inside <Field>; search boxes never take a Field label.",
    "Submit-to-search flows (a query sent to a server on Enter) — nothing in the DS yet; this one filters live.",
  ],
  a11y: [
    "`aria-label` is required by the props type — a search box has no visible label, so the accessible name must come from somewhere.",
    "The magnifier and clear-X svgs are aria-hidden; the clear button carries aria-label=\"Clear search\" (the shipped wording).",
    "Focus ring is the wrapper's :focus-within `action` border — the inner input is outline-none by design (the wrapper owns all visuals).",
  ],
  tokens: [
    "bg / bgHover (surfaces)",
    "border / buttonSecondaryBorder",
    "action (focus-within border)",
    "textMuted (icon + placeholder)",
    "rounded 10px (the shipped search radius — NOT the `.input` 8px; existing call-site value)",
  ],
};
