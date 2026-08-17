"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";
import IconButton from "./IconButton";
import { CloseIcon } from "./Icons";

/**
 * Modal — DS primitive, built on the native <dialog> element.
 *
 * The browser provides what the five legacy hand-rolled modals never had:
 * focus trapping in the top layer, ESC-to-close, implicit role="dialog" +
 * aria-modal, and a ::backdrop (painted with the DESIGN.md scrim token).
 *
 * Controlled: pass `open` + `onClose`. ESC and scrim-click both report
 * through `onClose`; the parent owns the state, same contract as Drawer.
 *
 * `title` is required and wired to aria-labelledby — a dialog a screen
 * reader can't name is the exact gap this component exists to close.
 */

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Action row rendered below the body, right-aligned (Buttons). */
  footer?: ReactNode;
  /** Max width: sm 400 / md 520 (default) / lg 640. */
  size?: ModalSize;
  /** Built-in X in the header (default true — Caroline's ruling 2026-08-11). */
  closeButton?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeButton = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn("modal", `modal--${size}`)}
      aria-labelledby={titleId}
      // ESC fires `cancel`: report to the parent instead of letting the
      // dialog close itself, so `open` stays the single source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Scrim click: the backdrop registers events on the dialog element
      // itself (events inside land on children). Close only when the PRESS
      // started on the backdrop too — otherwise a text-selection drag that
      // starts inside a form and releases over the scrim would eat the
      // user's half-filled form (peer review, 2026-08-11).
      onPointerDown={(e) => {
        pressOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressOnBackdrop.current) onClose();
        pressOnBackdrop.current = false;
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {closeButton && (
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </div>
      <div className="mt-4 text-sm text-text-secondary">{children}</div>
      {footer && (
        <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>
      )}
    </dialog>
  );
}
