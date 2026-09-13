import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Icon-only actions: meatball/overflow menus, plus (add task), close buttons, delete-a-row.",
    "Icon-only LINKS: pass `href` and it renders an <a> with the identical skin, label and tone, forwarding `download` / `target` / `rel` (the file-row downloads in TaskDrawer and PortalDrawer). Caroline's ruling, 2026-09-12: never hand-copy the `.icon-btn` class string onto an <a>. The `vector/no-raw-icon-button` lint enforces it.",
    "Pass `isActive` while the menu/popover it controls is open — applies `.icon-btn--active` (surfaceHover fill, full text colour) so the trigger stays lit.",
    "Registry icons from app/ui/Icons.tsx at their 14px default, using `currentColor` so the glyph inherits the state colour (see DESIGN.md). Never draw a fresh inline SVG at the call site.",
    "NEW (pending Caroline's review): `tone=\"danger\"` for destructive icon actions (delete a row) — glyph at danger stepping to dangerHover, mirroring .btn-tertiary--danger (danger → dangerHover); hover/active fills stay the neutral bgHover/surfaceHover.",
  ],
  dontUseWhen: [
    "The action has a visible text label — use Button.",
    "Avatars or anything circular — `rounded-full` is for avatar circles ONLY (CLAUDE.md); IconButton is fixed `w-5 h-5 rounded`.",
    "Menu/dropdown triggers that show a label — use MenuTriggerButton (app/components/Menu.js).",
    "An in-page action dressed as a link — `href` is for real navigation and downloads only. The props are a discriminated union, so button attributes (onClick, disabled, type) are a compile error in link mode and anchor attributes are a compile error in button mode.",
    "Anything bigger than `size=\"md\"` (28px box, 16px glyph, the header bells) — there is no large size yet; ask for one rather than restyling.",
  ],
  a11y: [
    "`aria-label` is REQUIRED (enforced by the props type) — it is the button's entire accessible name; icons are decorative.",
    "Renders a native <button type=\"button\">, or a native <a href> in link mode — keyboard activation and the right role come free either way; a link is announced as a link and reached with the links rotor.",
    "Shared `:focus-visible` ring via the .icon-btn rule in globals.css (2px focusRing, 2px offset).",
    "Disabled suppresses hover, dims to iconTertiary, and blocks clicks natively.",
  ],
  tokens: ["textMuted", "bgHover", "surfaceHover", "iconTertiary", "focusRing", "danger (tone=danger)", "dangerHover (tone=danger)"],
};
