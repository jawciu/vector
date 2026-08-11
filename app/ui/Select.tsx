"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Select — DS primitive, a thin styled native <select>.
 *
 * Shares the `.input` class with Input/Textarea; options come through as
 * children. Deliberately keeps the native dropdown arrow and popup —
 * `appearance: none` without a replacement chevron would leave the control
 * unmarked, and a custom popup is MenuList's job (see DESIGN.md), not this
 * primitive's. `invalid` behaves exactly as on Input.
 */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Danger border + aria-invalid. */
  invalid?: boolean;
}

export default function Select({ invalid, className, ...props }: SelectProps) {
  const isInvalid =
    invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <select
      {...props}
      aria-invalid={isInvalid || undefined}
      className={cn("input", isInvalid && "input--invalid", className)}
    />
  );
}
