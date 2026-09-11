"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * TextField — DS primitive, a thin styled native <input>.
 * (Renamed from Input — Caroline's review 2026-08-11: "an input should be
 * called text field". The CSS class stays `.input` for now: renaming the CSS
 * layer is a separate decision, tracked outside this rename.)
 *
 * All visual state lives in the `.input` CSS class (globals.css), whose state
 * model is extracted from `.search-input`: `border` on `bg` → hover `bg-hover`
 * + `buttonSecondaryBorder` → focus `action` border.
 *
 * `invalid` sets aria-invalid and the `danger` border (`.input--invalid`).
 * When rendered inside <Field error={…}>, Field wires aria-invalid via
 * cloneElement instead — TextField honours that too, so the error border never
 * needs the prop set twice.
 */

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Danger border + aria-invalid. */
  invalid?: boolean;
}

export default function TextField({ invalid, className, ...props }: TextFieldProps) {
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
