import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Picking one value from a small fixed set inside a form — usually inside `<Field>`.",
    "Anywhere a hand-rolled `<select>` exists today (Phase 7 retrofits them onto this).",
  ],
  dontUseWhen: [
    "Rich dropdowns with avatars, icons, or search — use MenuList + MenuOption (the DESIGN.md dropdown contract).",
    "Pill-shaped pickers in modal bodies (due date, priority, status) — use FieldPill + its dropdown.",
    "Multi-select or tagging — nothing in the DS yet.",
  ],
  a11y: [
    "Needs an accessible name: render inside `<Field label=…>` (preferred) or pass aria-label when standalone.",
    "`invalid` sets aria-invalid; an incoming aria-invalid (cloned in by Field's `error`) triggers the same danger border.",
    "Keeps the NATIVE popup and arrow deliberately — full keyboard and screen-reader behaviour for free; no appearance:none without a replacement affordance.",
  ],
  tokens: [
    "bg / bgHover (surfaces)",
    "border / buttonSecondaryBorder",
    "action (focus border)",
    "danger (invalid border)",
    "rounded.lg (8px)",
  ],
};
