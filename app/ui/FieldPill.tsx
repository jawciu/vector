"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { CloseIcon } from "./Icons";

/**
 * FieldPill — DS primitive
 *
 * Small bordered pill for inline field selectors (date, priority, status, etc.).
 * Grows to fill available space (flex-1).
 *
 * TWO MODES, decided by `onClick`, and they are mutually exclusive:
 *
 *   TRIGGER (onClick given) — the pill opens something. The main area is a
 *   native <button type="button">, so keyboard and screen-reader behaviour
 *   come for free, and the wrapper carries the pressable hover fill.
 *
 *   CONTAINER (no onClick) — the pill HOLDS a control (a text input) or a
 *   read-only value. The main area is a plain <div> with the same classes:
 *   an <input> inside a <button> is invalid HTML (the parser un-nests it) and
 *   a keyboard trap risk, and a container must not advertise a press it does
 *   not do, so the pressable hover fill and the pointer cursor are off. Never
 *   pass `onClick` AND an interactive child: a pill that holds an input is a
 *   container, not a trigger. It will become the boxed TextField in slice 4.
 *
 * A trigger announces its popup: `aria-haspopup` comes from `popup` and
 * `aria-expanded` mirrors `active` whenever `active` is a boolean, so the
 * visual open state and the announced one can never disagree (DESIGN.md).
 *
 * Either way a non-interactive wrapper div carries the box (border, fill,
 * hover/active states). With `onClear` and a value, a Clear (X) <button>
 * follows the main area inline at the end of the row, hidden at rest (no
 * reserved space) and shown on hover, focus-within or while active, so the
 * pill grows to fit it: the app's due-date pill pattern.
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — highlights bg when the pill's dropdown is open, and (when it
 *               is a boolean) drives `aria-expanded` on the trigger button
 *   popup     — TRIGGER mode: what `onClick` opens, for `aria-haspopup`.
 *               "menu" (default) | "listbox" | "dialog"; a CalendarDropdown
 *               host passes "dialog"
 *   onClick   — TRIGGER mode: click handler on the main button
 *   onClear   — clears the value; renders the inline Clear (X) when children are set
 *   children  — custom content (overrides label)
 */

/** What the trigger opens — drives `aria-haspopup`. */
export type FieldPopup = "menu" | "listbox" | "dialog";

interface FieldPillBaseProps {
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  onClear?: () => void;
  active?: boolean;
}

/** Trigger mode: the main area is a native button. */
interface FieldPillTriggerProps extends FieldPillBaseProps {
  onClick: MouseEventHandler<HTMLButtonElement>;
  popup?: FieldPopup;
}

/** Container mode: the main area is a static div that may hold a control. */
interface FieldPillContainerProps extends FieldPillBaseProps {
  onClick?: never;
  popup?: never;
}

export type FieldPillProps = FieldPillTriggerProps | FieldPillContainerProps;

export default function FieldPill({ icon, label, children, onClick, onClear, active, popup = "menu" }: FieldPillProps) {
  const mainClassName = "field-main flex flex-1 items-center gap-1 rounded-lg";
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
      className="field-pill flex flex-1 items-center rounded-lg"
      data-active={active ? "true" : undefined}
      data-static={onClick ? undefined : "true"}
      style={{ border: "1px solid var(--button-secondary-border)", minHeight: 26 }}
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

/**
 * The X that clears a field's value: a real <button aria-label="Clear">, a
 * sibling of the main area (never nested in it). display:none at rest, so
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
