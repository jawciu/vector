import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Focused tasks that block the page until resolved: create/edit forms, confirmations, destructive-action prompts.",
    "Anything the legacy scrim-div modals did — this is their replacement (Phase 7 retrofits all five onto it).",
    "Destructive confirmations: pair a `destructive` Button in the footer with a `tertiary` cancel.",
  ],
  dontUseWhen: [
    "Side-panel detail views that keep page context visible — use Drawer.",
    "Lightweight anchored pickers — use MenuList or CalendarDropdown.",
    "Non-blocking notices — nothing modal; render inline or wait for Toast.",
  ],
  a11y: [
    "Native <dialog> + showModal(): real focus trap in the top layer, implicit role=\"dialog\" and aria-modal — no library, no hand-rolled trap.",
    "`title` is required and wired to aria-labelledby; never render a dialog a screen reader can't name.",
    "ESC and scrim-click both report through onClose; the parent owns `open` (same controlled contract as Drawer).",
  ],
  tokens: ["scrim (overlays)", "bgElevated", "border", "rounded.xl (12px)"],
};
