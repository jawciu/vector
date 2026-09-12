"use client";

import { cn } from "./cn";
import IconButton from "./IconButton";
import { CloseIcon, SearchIcon } from "./Icons";

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
 * Both glyphs come from the icon registry (`SearchIcon`, `CloseIcon`).
 *
 * NEW — pending Caroline's review (nothing in the app renders these yet):
 * 1. `onClear`: when provided and the field is non-empty, a clear X
 *    `IconButton` (20x20, the DS icon-button size) appears. The shipped
 *    ActionsTab search used a TEXT "Clear" button (`.text-btn`); the X-icon
 *    affordance is the new design decision.
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
      <SearchIcon style={{ color: "var(--text-muted)", flexShrink: 0 }} />
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
        <IconButton
          aria-label="Clear search"
          onClick={onClear}
          disabled={disabled}
          className="shrink-0"
        >
          <CloseIcon />
        </IconButton>
      )}
    </div>
  );
}
