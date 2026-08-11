"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Input — DS primitive, a thin styled native <input>.
 *
 * All visual state lives in the `.input` CSS class (globals.css), whose state
 * model is extracted from `.search-input`: `border` on `bg` → hover `bg-hover`
 * + `buttonSecondaryBorder` → focus `action` border.
 *
 * `invalid` sets aria-invalid and the `danger` border (`.input--invalid`).
 * When rendered inside <Field error={…}>, Field wires aria-invalid via
 * cloneElement instead — Input honours that too, so the error border never
 * needs the prop set twice.
 */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Danger border + aria-invalid. */
  invalid?: boolean;
}

export default function Input({ invalid, className, ...props }: InputProps) {
  const isInvalid =
    invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <input
      {...props}
      aria-invalid={isInvalid || undefined}
      className={cn("input", isInvalid && "input--invalid", className)}
    />
  );
}
