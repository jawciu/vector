"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { CloseIcon } from "./Icons";

/**
 * FieldPill — DS primitive
 *
 * Small bordered pill for inline field selectors (date, priority, status, etc.).
 * Grows to fill available space (flex-1).
 *
 * Structure: a non-interactive wrapper div carries the pill's box (border,
 * fill, hover/active states); inside it the main control is a native
 * <button type="button"> with the icon/label/children and the onClick, so
 * keyboard and screen-reader behaviour come for free. With `onClear` and a
 * value, a Clear (X) <button> follows it inline at the end of the row,
 * hidden at rest (no reserved space) and shown on hover, focus-within or
 * while active, so the pill grows to fit it: the app's due-date pill pattern.
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — highlights bg when the pill's dropdown is open
 *   onClick   — click handler on the main button (typically toggles a dropdown)
 *   onClear   — clears the value; renders the inline Clear (X) when children are set
 *   children  — custom content (overrides label)
 */

export interface FieldPillProps {
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onClear?: () => void;
  active?: boolean;
}

export default function FieldPill({ icon, label, children, onClick, onClear, active }: FieldPillProps) {
  return (
    <div
      className="field-pill flex flex-1 items-center rounded-lg"
      data-active={active ? "true" : undefined}
      style={{ border: "1px solid var(--button-secondary-border)", minHeight: 26 }}
    >
      <button type="button" className="field-main flex flex-1 items-center gap-1 rounded-lg" onClick={onClick}>
        {icon}
        {children || (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</span>
        )}
      </button>
      {onClear && children && <PillClearButton onClick={onClear} />}
    </div>
  );
}

/**
 * The X that clears a field's value: a real <button aria-label="Clear">, a
 * sibling of the main control (never nested in it). display:none at rest, so
 * no space is reserved; the wrapper's :hover / :focus-within / data-active
 * shows it. Tab reaches the main control first, which reveals it, then the X.
 * Shared with FieldRow.
 */
export function PillClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Clear" className="field-clear items-center justify-center rounded" onClick={onClick}>
      <CloseIcon size={9} />
    </button>
  );
}
