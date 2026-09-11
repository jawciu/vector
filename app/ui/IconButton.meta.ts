import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Icon-only actions: meatball/overflow menus, plus (add task), close buttons, delete-a-row.",
    "Pass `isActive` while the menu/popover it controls is open — applies `.icon-btn--active` (surfaceHover fill, full text colour) so the trigger stays lit.",
    "Inner SVGs at 11–12px using `currentColor` so the icon inherits the state colour (see DESIGN.md).",
    "NEW (pending Caroline's review): `tone=\"danger\"` for destructive icon actions (delete a row) — glyph at danger stepping to dangerHover, mirroring .text-btn-danger; hover/active fills stay the neutral bgHover/surfaceHover.",
  ],
  dontUseWhen: [
    "The action has a visible text label — use Button (any variant, including `text`).",
    "Avatars or anything circular — `rounded-full` is for avatar circles ONLY (CLAUDE.md); IconButton is fixed `w-5 h-5 rounded`.",
    "Menu/dropdown triggers that show a label — use MenuTriggerButton (app/components/Menu.js).",
    "Larger tap targets or toolbar buttons — the 20×20 box is fixed by design; don't restyle it, ask for a size variant first.",
  ],
  a11y: [
    "`aria-label` is REQUIRED (enforced by the props type) — it is the button's entire accessible name; icons are decorative.",
    "Renders a native <button type=\"button\"> — keyboard activation comes free.",
    "Shared `:focus-visible` ring via the .icon-btn rule in globals.css (2px focusRing, 2px offset).",
    "Disabled suppresses hover, dims to iconTertiary, and blocks clicks natively.",
  ],
  tokens: ["textMuted", "bgHover", "surfaceHover", "iconTertiary", "focusRing", "danger (tone=danger)", "dangerHover (tone=danger)"],
};
