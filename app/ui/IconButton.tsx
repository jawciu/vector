import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * IconButton — DS primitive
 *
 * Small square icon-only control (meatball menus, plus icons, close buttons,
 * icon-only download links). Fixed at `w-5 h-5` (20×20px), `rounded` (NOT
 * `rounded-full` — that's for avatar circles only). Visual states come from
 * `.icon-btn` in globals.css; `isActive` applies `.icon-btn--active` while
 * the menu it controls is open.
 *
 * Inner icons come from the registry (`app/ui/Icons.tsx`) at its 14px default
 * and use `currentColor` (see DESIGN.md).
 * `aria-label` is REQUIRED: there is no visible text, so the label is the
 * control's entire accessible name.
 *
 * TWO ELEMENTS, decided by `href` (Caroline's ruling, 2026-09-12: an
 * icon-only LINK must come from the primitive too, not a hand-copied class
 * string):
 *   no href — a native `<button type="button">`.
 *   href    — an `<a>` with the identical classes, label and tone; `download`,
 *             `target` and `rel` pass through. Use it for navigation and file
 *             downloads, never for an in-page action.
 * The props are a discriminated union, so button-only attributes cannot leak
 * onto the anchor and anchor-only attributes cannot leak onto the button.
 *
 * `tone`:
 *   action — default, the neutral textMuted glyph (unchanged rendering)
 *   danger — destructive actions (delete a row, remove a member): the glyph
 *            reads `danger` and steps to `danger-hover` on hover/active,
 *            mirroring .btn-tertiary--danger; the hover/active background fills
 *            stay the neutral bgHover/surfaceHover steps.
 *
 * `className` is accepted for LAYOUT ONLY (positioning within a parent —
 * e.g. Drawer's absolutely-placed close button), merged via cn() so caller
 * utilities win. Restyling the control itself is a variant request, not a
 * className job. (Peer-review policy decision, 2026-08-11 — the ban made
 * Drawer hand-roll its own copy, which is worse than an escape hatch.)
 */

export type IconButtonTone = "action" | "danger";
/** sm: 20px box, 14px glyph (default, everywhere). md: 28px box, 16px glyph (header bells). */
export type IconButtonSize = "sm" | "md";

interface IconButtonSharedProps {
  /** Required — icon-only controls have no visible text to name them. */
  "aria-label": string;
  /** True while the menu/popover this control opens is open. */
  isActive?: boolean;
  /** "danger" for destructive icon actions. */
  tone?: IconButtonTone;
  /** Box + glyph size; "sm" unless a surface needs the bigger tap target. */
  size?: IconButtonSize;
  className?: string;
}

/** Action mode: renders <button type="button">. */
type IconButtonButtonProps = IconButtonSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "className"> & {
    href?: never;
  };

/** Link mode: renders <a href>, for navigation and downloads. */
type IconButtonLinkProps = IconButtonSharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "aria-label" | "className" | "href"> & {
    href: string;
  };

export type IconButtonProps = IconButtonButtonProps | IconButtonLinkProps;

export default function IconButton(props: IconButtonProps) {
  const { isActive, tone = "action", size = "sm", className, children, ...rest } = props;
  const classes = cn(
    "icon-btn flex items-center justify-center rounded",
    size === "md" ? "icon-btn--md w-7 h-7" : "w-5 h-5",
    tone === "danger" && "icon-btn--danger",
    isActive && "icon-btn--active",
    className
  );

  if (rest.href !== undefined) {
    const { href, ...anchorProps } = rest as IconButtonLinkProps;
    return (
      <a href={href} {...anchorProps} className={classes}>
        {children}
      </a>
    );
  }

  const { href: _href, ...buttonProps } = rest as IconButtonButtonProps;
  void _href;
  return (
    <button type="button" {...buttonProps} className={classes}>
      {children}
    </button>
  );
}
