import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * IconButton — DS primitive
 *
 * Small square icon-only button (meatball menus, plus icons, close buttons).
 * Fixed at `w-5 h-5` (20×20px), `rounded` (NOT `rounded-full` — that's for
 * avatar circles only). Visual states come from `.icon-btn` in globals.css;
 * `isActive` applies `.icon-btn--active` while the menu it controls is open.
 *
 * Inner SVGs should be 11–12px and use `currentColor` (see DESIGN.md).
 * `aria-label` is REQUIRED: there is no visible text, so the label is the
 * button's entire accessible name.
 *
 * `tone` (NEW 2026-08, pending Caroline's review):
 *   action — default, the neutral textMuted glyph (unchanged rendering)
 *   danger — destructive actions (delete a row, remove a member): the glyph
 *            reads `danger` and steps to `danger-hover` on hover/active,
 *            mirroring .btn-tertiary--danger; the hover/active background fills
 *            stay the neutral bgHover/surfaceHover steps.
 *
 * `className` is accepted for LAYOUT ONLY (positioning within a parent —
 * e.g. Drawer's absolutely-placed close button), merged via cn() so caller
 * utilities win. Restyling the button itself is a variant request, not a
 * className job. (Peer-review policy decision, 2026-08-11 — the ban made
 * Drawer hand-roll its own copy, which is worse than an escape hatch.)
 */

export type IconButtonTone = "action" | "danger";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only buttons have no visible text to name them. */
  "aria-label": string;
  /** True while the menu/popover this button controls is open. */
  isActive?: boolean;
  /** NEW, pending review — "danger" for destructive icon actions. */
  tone?: IconButtonTone;
}

export default function IconButton({
  isActive,
  tone = "action",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "icon-btn flex items-center justify-center w-5 h-5 rounded",
        tone === "danger" && "icon-btn--danger",
        isActive && "icon-btn--active",
        className
      )}
    >
      {children}
    </button>
  );
}
