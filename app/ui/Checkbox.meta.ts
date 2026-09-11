import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Multi-select rows inside dropdowns and pickers — the TaskDrawer / CreateTaskModal member lists, ContactsPanel bulk rows (Phase 7 retrofits them onto this).",
    "Any binary include/exclude toggle rendered as a small square box.",
  ],
  dontUseWhen: [
    "Marking a task done — that's TaskTick (circular, `success`, bounce animation).",
    "Bulk-selecting draft cards in the AI inbox — that surface uses the circular `action` SelectCheckbox idiom, not the square box; not absorbed yet.",
    "Select-all headers needing an indeterminate state — not absorbed yet; ContactsPanel keeps its local version.",
    "On/off settings that apply immediately — a switch idiom (nothing in the DS yet), not a checkbox.",
  ],
  a11y: [
    "aria-label is required by the props type — the box has no visible text of its own. A wrapping <label> also names it (the root is a labelable <button>).",
    "role=\"checkbox\" + aria-checked on a native button: Space and Enter both toggle for free.",
    "NEW (pending Caroline's review): focus-visible shows the standard `focusRing` outline — the hand-rolled originals had no keyboard focus style.",
  ],
  tokens: [
    "iconTertiary (unchecked outline — the hex the shipped svgs hardcoded)",
    "action (hover outline + checked fill)",
    "actionText (tick)",
    "focusRing (focus outline)",
    "rounded.sm (4px — rx 3.5 on the 14px svg)",
  ],
};
