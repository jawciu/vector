"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Button — DS primitive
 *
 * Variants:
 *   primary     — solid purple action button
 *   secondary   — bordered surface button
 *   tertiary    — bare label, no fill or border (dismiss, cancel, edit)
 *   destructive — solid danger button (delete, revoke)
 *   text        — inline text-only button (use with `tone`)
 *
 * Sizes (primary | secondary | tertiary | destructive):
 *   xs  — compact inline (py-0.5 px-2 text-xs)
 *   sm  — default (py-1 px-2 text-sm)
 *
 * Tone (text variant only):
 *   action  — purple (default)
 *   danger  — red/pink
 *
 * loading — shows a centred spinner, blocks interaction, sets aria-busy, and
 * preserves the button's width (the label goes invisible instead of unmounting)
 * so the layout never jumps.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "destructive"
  | "text";
export type ButtonSize = "xs" | "sm";
export type ButtonTone = "action" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** text variant only */
  tone?: ButtonTone;
  loading?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "py-0.5 px-2 text-xs",
  sm: "py-1 px-2 text-sm",
};

const SOLID_BASE = "flex items-center gap-2 rounded-lg";

const VARIANT_CLASSES: Record<Exclude<ButtonVariant, "text">, string> = {
  primary: "btn-primary font-semibold",
  secondary: "btn-secondary font-normal",
  tertiary: "btn-tertiary font-normal",
  destructive: "btn-destructive font-semibold",
};

export default function Button({
  variant = "primary",
  size = "sm",
  tone = "action",
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const base =
    variant === "text"
      ? cn("text-btn", tone === "danger" ? "text-btn-danger" : "text-btn-action")
      : cn(VARIANT_CLASSES[variant], SOLID_BASE, SIZE_CLASSES[size]);

  return (
    <button
      type="button"
      className={cn(base, loading && "relative", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          {/* invisible (not unmounted) so the button keeps its width */}
          <span className="invisible flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="btn-spinner" aria-hidden="true" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
