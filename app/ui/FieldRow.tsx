"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { PillClearButton, type FieldPopup } from "./FieldPill";

/**
 * FieldRow — DS primitive (drawer detail view)
 *
 * Clean label+value row with no default border. Border + background appear
 * only when active (dropdown open). Content-hugging (inline-flex, not full-width).
 *
 * TWO MODES, decided by `onClick`, exactly as FieldPill, and they are
 * mutually exclusive:
 *
 *   TRIGGER (onClick given) — the main area is a native
 *   <button type="button"> and the row carries the pressable hover fill.
 *
 *   CONTAINER (no onClick) — the main area is a plain <div> with the same
 *   classes: for a row that holds a control (an <input> inside a <button> is
 *   invalid HTML and a keyboard trap risk) or a read-only value, which must
 *   not advertise a press it does not do. Hover fill and pointer cursor are
 *   off; :focus-within still lights the row so a focused inner control reads
 *   as active. Never pass `onClick` AND an interactive child: a row that
 *   holds an input is a container, not a trigger, and becomes the boxed
 *   TextField in slice 4.
 *
 * A trigger announces its popup: `aria-haspopup` comes from `popup` and
 * `aria-expanded` mirrors `active` whenever `active` is a boolean, so the
 * visual open state and the announced one can never disagree (DESIGN.md).
 *
 * Either way a non-interactive wrapper div carries the box and states. With
 * `onClear` and a value, a Clear (X) <button> follows inline at the end of
 * the row, hidden at rest and shown on hover, focus-within or while active,
 * so the row grows to fit it (TaskDrawer's due-date row).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — shows border + bg when the row's dropdown is open, and (when
 *               it is a boolean) drives `aria-expanded` on the trigger button
 *   popup     — TRIGGER mode: what `onClick` opens, for `aria-haspopup`.
 *               "menu" (default) | "listbox" | "dialog"; a CalendarDropdown
 *               host passes "dialog"
 *   onClick   — TRIGGER mode: click handler on the main button
 *   onClear   — clears the value; renders the inline Clear (X) when children are set
 *   children  — custom content (overrides label)
 */

interface FieldRowBaseProps {
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  onClear?: () => void;
  active?: boolean;
}

/** Trigger mode: the main area is a native button. */
interface FieldRowTriggerProps extends FieldRowBaseProps {
  onClick: MouseEventHandler<HTMLButtonElement>;
  popup?: FieldPopup;
}

/** Container mode: the main area is a static div that may hold a control. */
interface FieldRowContainerProps extends FieldRowBaseProps {
  onClick?: never;
  popup?: never;
}

export type FieldRowProps = FieldRowTriggerProps | FieldRowContainerProps;

export default function FieldRow({ icon, label, children, onClick, onClear, active, popup = "menu" }: FieldRowProps) {
  const mainClassName = "field-main flex items-center gap-2 rounded-lg";
  const body = (
    <>
      {icon}
      {children || (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</span>
      )}
    </>
  );

  return (
    <div
      className="field-row inline-flex items-center rounded-lg"
      data-active={active ? "true" : undefined}
      data-static={onClick ? undefined : "true"}
      style={{ minHeight: 26 }}
    >
      {onClick ? (
        <button
          type="button"
          className={mainClassName}
          onClick={onClick}
          aria-haspopup={popup}
          aria-expanded={typeof active === "boolean" ? active : undefined}
        >
          {body}
        </button>
      ) : (
        <div className={mainClassName}>{body}</div>
      )}
      {onClear && children && <PillClearButton onClick={onClear} />}
    </div>
  );
}
