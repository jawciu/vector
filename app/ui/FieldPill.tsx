"use client";

import type { KeyboardEvent, MouseEventHandler, ReactNode } from "react";

/**
 * FieldPill — DS primitive
 *
 * Small bordered pill for inline field selectors (date, priority, status, etc.).
 * Grows to fill available space (flex-1).
 *
 * Stays a <div> (call-site layout depends on it) but is keyboard operable
 * when `onClick` is present: role="button", tabIndex=0, and Enter/Space
 * synthesize a click (Space with preventDefault so the page doesn't scroll).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — highlights bg when the pill's dropdown is open
 *   onClick   — click handler (typically toggles a dropdown)
 *   children  — custom content (overrides label)
 */

export interface FieldPillProps {
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  active?: boolean;
}

export default function FieldPill({ icon, label, children, onClick, active }: FieldPillProps) {
  return (
    <div
      className="field-pill flex flex-1 items-center gap-1 rounded-lg cursor-pointer"
      data-active={active ? "true" : undefined}
      style={{
        border: "1px solid var(--button-secondary-border)",
        padding: "4px 8px",
        minHeight: 26,
      }}
      onClick={onClick}
      // Keyboard operability without changing the element: only interactive
      // when a click handler exists (a bare display pill stays a plain div).
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleActionKeys : undefined}
    >
      {icon}
      {children || (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</span>
      )}
    </div>
  );
}

/**
 * Enter/Space activate the pill like a native button. Space must
 * preventDefault so the page doesn't scroll; the synthesized
 * `currentTarget.click()` re-enters the normal onClick path with a real
 * MouseEvent (no handler-signature contortions). Keys originating on
 * focusable children (e.g. an inner clear button) are left alone — the
 * child owns its own activation. (Mirrored in FieldRow.)
 */
function handleActionKeys(e: KeyboardEvent<HTMLDivElement>) {
  if (e.target !== e.currentTarget) return;
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.key === " ") e.preventDefault();
  e.currentTarget.click();
}
