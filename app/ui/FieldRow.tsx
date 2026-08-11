"use client";

import type { KeyboardEvent, MouseEventHandler, ReactNode } from "react";

/**
 * FieldRow — DS primitive (drawer detail view)
 *
 * Clean label+value row with no default border. Border + background appear
 * only when active (dropdown open). Content-hugging (inline-flex, not full-width).
 *
 * Stays a <div> (call-site layout depends on it) but is keyboard operable
 * when `onClick` is present: role="button", tabIndex=0, and Enter/Space
 * synthesize a click (Space with preventDefault so the page doesn't scroll).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — shows border + bg when the row's dropdown is open
 *   onClick   — click handler
 *   children  — custom content (overrides label)
 */

export interface FieldRowProps {
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  active?: boolean;
}

export default function FieldRow({ icon, label, children, onClick, active }: FieldRowProps) {
  return (
    <div
      className="field-row inline-flex items-center gap-2 rounded-lg cursor-pointer"
      data-active={active ? "true" : undefined}
      style={{ padding: "4px 8px", minHeight: 26 }}
      onClick={onClick}
      // Keyboard operability without changing the element: only interactive
      // when a click handler exists (a bare display row stays a plain div).
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
 * Enter/Space activate the row like a native button. Space must
 * preventDefault so the page doesn't scroll; the synthesized
 * `currentTarget.click()` re-enters the normal onClick path with a real
 * MouseEvent (no handler-signature contortions). Keys originating on
 * focusable children (e.g. an inner clear button) are left alone — the
 * child owns its own activation. (Mirrored in FieldPill.)
 */
function handleActionKeys(e: KeyboardEvent<HTMLDivElement>) {
  if (e.target !== e.currentTarget) return;
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.key === " ") e.preventDefault();
  e.currentTarget.click();
}
