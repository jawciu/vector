"use client";

import { useState } from "react";
import { cn } from "./cn";

/**
 * Checkbox — DS primitive, the dropdown-row checkbox ("the one we use in
 * drop downs", Caroline's review 2026-08-11).
 *
 * Extracted from the member-picker dropdowns (TaskDrawer.js ~1104 /
 * CreateTaskModal.js ~640, identical svgs; ContactsPanel.js's `Checkbox` is
 * the same family): a 14px rounded square inside a 16px hit area
 * (`.checkbox` in globals.css, mirroring `.member-checkbox`).
 *
 *   unchecked       → `iconTertiary` outline (the shipped hardcoded hex IS that token's value)
 *   unchecked hover → `action` outline
 *   checked         → `action` fill, tick in `actionText`
 *   disabled        → 40% wash + not-allowed cursor
 *
 * The checked tick uses the shipped cutout path (the tick is negative space
 * in the `action` fill) over an `actionText` backing rect — in the app the
 * cutout showed the `bg` surface through, and `actionText` is that same ink,
 * so this pins the ruled look on any surface.
 *
 * Controlled: `checked` + `onChange(next)`. Button-based (role="checkbox" +
 * aria-checked) like every shipped instance, so it works inside dropdown
 * rows that are themselves not <form> content. Space and Enter both toggle
 * (native button activation).
 *
 * NEW — pending Caroline's review: the focus-visible `focusRing` outline;
 * none of the hand-rolled checkboxes had a keyboard focus style.
 * Not absorbed (yet): ContactsPanel's indeterminate select-all state.
 */

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Required — the box has no visible text of its own. (A wrapping <label>
   *  also works: the root is a button, which is labelable.) */
  "aria-label": string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export default function Checkbox({
  checked,
  onChange,
  "aria-label": ariaLabel,
  disabled,
  className,
  id,
}: CheckboxProps) {
  const [hovered, setHovered] = useState(false);
  const strokeColor =
    hovered && !disabled ? "var(--action)" : "var(--icon-tertiary)";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("checkbox", className)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        {checked ? (
          <>
            {/* actionText backing — shows through the tick cutout below */}
            <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--action-text)" />
            <path
              d="M10 0C12.2091 0 14 1.79086 14 4V10C14 12.2091 12.2091 14 10 14H4C1.79086 14 9.66399e-08 12.2091 0 10V4C0 1.79086 1.79086 9.66384e-08 4 0H10ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
              fill="var(--action)"
            />
          </>
        ) : (
          <rect
            x="0.5"
            y="0.5"
            width="13"
            height="13"
            rx="3.5"
            stroke={strokeColor}
            style={{ transition: "stroke 0.15s ease" }}
          />
        )}
      </svg>
    </button>
  );
}
