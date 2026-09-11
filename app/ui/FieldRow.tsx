"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { PillClearButton } from "./FieldPill";

/**
 * FieldRow — DS primitive (drawer detail view)
 *
 * Clean label+value row with no default border. Border + background appear
 * only when active (dropdown open). Content-hugging (inline-flex, not full-width).
 *
 * Structure mirrors FieldPill: a non-interactive wrapper div carries the box
 * and states; the main control is a native <button type="button"> with the
 * icon/label/children and the onClick. With `onClear` and a value, a Clear
 * (X) <button> follows inline at the end of the row, hidden at rest and shown
 * on hover, focus-within or while active, so the row grows to fit it
 * (TaskDrawer's due-date row).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — shows border + bg when the row's dropdown is open
 *   onClick   — click handler on the main button
 *   onClear   — clears the value; renders the inline Clear (X) when children are set
 *   children  — custom content (overrides label)
 */

export interface FieldRowProps {
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onClear?: () => void;
  active?: boolean;
}

export default function FieldRow({ icon, label, children, onClick, onClear, active }: FieldRowProps) {
  return (
    <div
      className="field-row inline-flex items-center rounded-lg"
      data-active={active ? "true" : undefined}
      style={{ minHeight: 26 }}
    >
      <button type="button" className="field-main flex items-center gap-2 rounded-lg" onClick={onClick}>
        {icon}
        {children || (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</span>
        )}
      </button>
      {onClear && children && <PillClearButton onClick={onClear} />}
    </div>
  );
}
