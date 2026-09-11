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
 *
 * Sizes (primary | secondary | tertiary | destructive):
 *   xs  — compact inline (py-0.5 px-2 text-xs)
 *   sm  — default (py-1 px-2 text-sm)
 *
 * Tone (tertiary only; the type forbids it elsewhere, and it is ignored at
 * runtime if it gets through):
 *   action  : default label colour
 *   danger  : red label (inline Revoke / Remove)
 *
 * loading — shows a centred spinner, blocks interaction, sets aria-busy, and
 * preserves the button's width (the label goes invisible instead of unmounting)
 * so the layout never jumps.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "destructive";
export type ButtonSize = "xs" | "sm";
export type ButtonTone = "action" | "danger";

interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  loading?: boolean;
}

/** `tone` only exists on the variants that can render it. */
export type ButtonProps = ButtonBaseProps &
  (
    | { variant?: "primary" | "secondary" | "destructive"; tone?: never }
    | { variant: "tertiary"; tone?: ButtonTone }
  );

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "py-0.5 px-2 text-xs",
  sm: "py-1 px-2 text-sm",
};

const SOLID_BASE = "flex items-center gap-2 rounded-lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
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
  const base = cn(
    VARIANT_CLASSES[variant],
    variant === "tertiary" && tone === "danger" && "btn-tertiary--danger",
    SOLID_BASE,
    SIZE_CLASSES[size],
  );

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
