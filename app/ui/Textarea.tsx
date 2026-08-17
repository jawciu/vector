"use client";

import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Textarea — DS primitive, a thin styled native <textarea>.
 *
 * Shares the `.input` class with TextField/Select (plus a `textarea.input` rule:
 * vertical resize, 80px min-height). `invalid` behaves exactly as on TextField.
 */

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Danger border + aria-invalid. */
  invalid?: boolean;
}

export default function Textarea({ invalid, className, ...props }: TextareaProps) {
  const isInvalid =
    invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <textarea
      {...props}
      aria-invalid={isInvalid || undefined}
      className={cn("input", isInvalid && "input--invalid", className)}
    />
  );
}
