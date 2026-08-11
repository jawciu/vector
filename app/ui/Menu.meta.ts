import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "EVERY dropdown/popover — even one-off menus (DESIGN.md rule): MenuList + MenuOption guarantee the consistent 4px container padding, 4px row gap, hover/active states and border.",
    "MenuTriggerButton for the opener: it carries the `.menu-trigger-pill` hover/active treatment and takes `active` while the menu is open so trigger and list read as one control.",
    "Parent owns the state: render MenuList conditionally next to the trigger inside a `position: relative` wrapper (it anchors `absolute` at `calc(100% + 4px)`), and mark the selected row with `active`.",
    "Caller-side tweaks go through `style` — it spread-merges over the base styles (e.g. `style={{ minWidth: \"100%\" }}` to match the trigger width).",
  ],
  dontUseWhen: [
    "Standalone action buttons — use Button/IconButton; the trigger pill implies something opens.",
    "Date picking — CalendarDropdown wraps these primitives with the calendar grid already wired.",
    "Blocking flows or forms — Modal; side-panel detail — Drawer. Menus are for light anchored choices.",
  ],
  a11y: [
    "Listbox semantics: MenuList defaults `role=\"listbox\"`, MenuOption renders `role=\"option\"` with `aria-selected` driven by `active`; options are native buttons, so Tab + Enter/Space work.",
    "HONEST GAPS (documented, not yet fixed — a separate reviewed change, NOT part of the Phase 5 move): no arrow-key navigation, no typeahead, no ESC-to-close, no focus management on open/close, and the trigger carries no `aria-expanded`/`aria-haspopup`. Callers own outside-click and ESC handling themselves until the DS grows a managed menu.",
  ],
  tokens: ["buttonSecondaryBorder (trigger)", "bgElevated (list)", "border", "bgHover (option hover)", "surfaceHover (option active)", "textMuted"],
};
