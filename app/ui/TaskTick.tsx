"use client";

import { useState } from "react";
import { cn } from "./cn";

/**
 * TaskTick — DS primitive, the circular mark-a-task-done tick ("the one that
 * we use to mark a task as done", Caroline's review 2026-08-11).
 *
 * Extracted from TaskCardView.js's `CheckboxButton` (the kanban card tick):
 * a 14px circle in a 22px hit area (`.task-tick` in globals.css).
 *
 *   unchecked       → `iconTertiary` ring + ghost check
 *   unchecked hover → ring + ghost check turn `success`
 *   checked         → `success` filled circle, tick as cutout
 *   marking done    → the existing `.checkbox-bounce` scale animation
 *
 * Toggle-button semantics: aria-pressed + a required aria-label (the shipped
 * button swapped its label "Mark as done" / "Mark as incomplete"; callers
 * should do the same).
 *
 * Controlled: `checked` + `onChange(next)`. Omit `onChange` for read-only
 * surfaces (InsightsPanel's shipped behaviour): the button disables without
 * washing out.
 *
 * Motion: the bounce fires on the unchecked → checked CLICK, skipped under
 * prefers-reduced-motion (checked in the handler — the globals.css
 * `checkboxBounce` keyframe itself is NOT reduced-motion-guarded; noted for
 * a separate pass, out of scope here).
 */

export interface TaskTickProps {
  checked: boolean;
  /** Omit for read-only surfaces — the tick renders but can't be pressed. */
  onChange?: (checked: boolean) => void;
  /** Required — no visible text. Swap it with state, e.g. checked ?
   *  "Mark as incomplete" : "Mark as done" (the shipped wording). */
  "aria-label": string;
  disabled?: boolean;
  className?: string;
}

export default function TaskTick({
  checked,
  onChange,
  "aria-label": ariaLabel,
  disabled,
  className,
}: TaskTickProps) {
  const [hovered, setHovered] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const interactive = typeof onChange === "function" && !disabled;
  const ghostColor =
    hovered && interactive ? "var(--success)" : "var(--icon-tertiary)";

  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel}
      disabled={!interactive}
      onClick={() => {
        if (!interactive) return;
        if (
          !checked &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          setBouncing(true);
        }
        onChange(!checked);
      }}
      onAnimationEnd={() => setBouncing(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("task-tick", bouncing && "checkbox-bounce", className)}
    >
      {checked ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
            fill="var(--success)"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <circle
            cx="7"
            cy="7"
            r="6.5"
            stroke={ghostColor}
            style={{ transition: "stroke 0.15s ease" }}
          />
          <path
            d="M3.5 7L6.5 9.5L10.5 4.5"
            stroke={ghostColor}
            strokeLinecap="round"
            style={{ transition: "stroke 0.15s ease" }}
          />
        </svg>
      )}
    </button>
  );
}
