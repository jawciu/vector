"use client";

import { cn } from "./cn";

/**
 * SearchField — DS primitive, the search box.
 *
 * Extracted from the two shipped `SearchInput`s (ActionsTab.js / MeetingsTab.js),
 * which were already identical: a wrapper div carrying the `.search-input`
 * class (globals.css) + a leading magnifier icon + a transparent inner input.
 * The WRAPPER owns all the visuals — border, bg, hover, :focus-within — which
 * is the documented `.search-input` pattern; the inner input stays border-less
 * and background-transparent.
 *
 * Controlled only: `value` + `onChange(nextValue)` (both call sites already
 * used the string-callback shape).
 *
 * NEW — pending Caroline's review (nothing in the app renders these yet):
 * 1. `onClear`: when provided and the field is non-empty, a clear X button
 *    appears. The shipped ActionsTab search used a TEXT "Clear" button
 *    (`.text-btn`); the X-icon affordance is the new design decision.
 * 2. `disabled`: the shipped searches can't be disabled; here the wrapper
 *    washes to 50% opacity (matching `.input:disabled`).
 *
 * Width is the caller's: the shipped call sites set 300px inline; pass
 * className/style for sizing (the wrapper stretches to its container).
 */

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** NEW — shows a clear X button while the field is non-empty. */
  onClear?: () => void;
  placeholder?: string;
  /** Required: a search box outside <Field> has no other accessible name. */
  "aria-label": string;
  /** Applied to the wrapper (sizing etc.). */
  className?: string;
  /** NEW — the shipped searches have no disabled state. */
  disabled?: boolean;
  id?: string;
}

export default function SearchField({
  value,
  onChange,
  onClear,
  placeholder,
  "aria-label": ariaLabel,
  className,
  disabled,
  id,
}: SearchFieldProps) {
  return (
    <div
      className={cn("search-input", className)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 10,
        maxWidth: "100%",
        ...(disabled ? { opacity: 0.5 } : null),
      }}
    >
      {/* TODO(icons sweep): swap for Icons.SearchIcon once it exists —
          exact svg harvested from ActionsTab.js SearchInput */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        style={{ color: "var(--text-muted)", flexShrink: 0 }}
      >
        <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: 13,
        }}
      />
      {onClear && value !== "" && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          disabled={disabled}
          style={{
            background: "none",
            border: "none",
            padding: 4,
            margin: -4,
            display: "flex",
            cursor: disabled ? "default" : "pointer",
            color: "var(--text-muted)",
          }}
        >
          {/* TODO(icons sweep): swap for Icons.CloseIcon once it exists */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
