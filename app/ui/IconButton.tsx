import type { ButtonHTMLAttributes } from "react";

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
 */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** Required — icon-only buttons have no visible text to name them. */
  "aria-label": string;
  /** True while the menu/popover this button controls is open. */
  isActive?: boolean;
}

export default function IconButton({ isActive, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-btn flex items-center justify-center w-5 h-5 rounded${isActive ? " icon-btn--active" : ""}`}
    >
      {children}
    </button>
  );
}
