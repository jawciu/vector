"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import IconButton from "./IconButton";
import { CheckIcon, CloseIcon } from "./Icons";

/**
 * Toast — DS primitive.
 *
 * A small card that slides in from the bottom-right corner, confirms that
 * something just happened, and takes itself away. It is deliberately NOT a
 * banner: it never takes the full width and never pushes layout, because the
 * user has already moved on to the next thing by the time it appears.
 *
 * Mount ONE `<ToastStack>` per surface and feed it from `useToasts()`. The
 * stack owns position and gap; each card owns its own dismiss timer, so
 * hovering one card pauses only that card.
 *
 * Motion: slide + fade in over `durationMedium`-ish 200ms on the standard
 * ease, the reverse on the way out. Under `prefers-reduced-motion` both
 * become a plain fade (handled in `.toast` CSS, not here).
 */

export interface ToastAction {
  label: string;
  /** Client-side route. Rendered as a next/link so it never reloads the page. */
  href?: string;
  onClick?: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction | null;
}

/** Newest sits at the bottom, nearest the corner the eye is already in. */
const MAX_VISIBLE = 3;
/** Long enough to read. Doubled-ish when there is something to click. */
const DISMISS_MS = 4000;
const DISMISS_WITH_ACTION_MS = 9000;
/** Must match the .toast animation duration in globals.css. */
const LEAVE_MS = 200;

let nextId = 0;

/** State host: `push(message, action?)` to raise one, `dismiss(id)` to pull it. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, action: ToastAction | null = null) => {
    const id = ++nextId;
    // Cap the stack rather than letting a burst of approvals cover the page.
    setToasts((prev) => [...prev, { id, message, action }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  return { toasts, push, dismiss };
}

export interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    // The stack itself is click-through so it never blocks the page beneath;
    // each card opts back in.
    <div className="toast-stack">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

export interface ToastProps {
  message: string;
  action?: ToastAction | null;
  onDismiss: () => void;
  /** Escape hatch for stories: render the leaving state. */
  leaving?: boolean;
  className?: string;
}

export default function Toast({
  message,
  action = null,
  onDismiss,
  leaving: leavingProp = false,
  className,
}: ToastProps) {
  const [leaving, setLeaving] = useState(leavingProp);
  const [paused, setPaused] = useState(false);
  // Held in a ref, synced in an effect (assigning during render is banned),
  // so the exit timer below is not restarted by a new callback identity on
  // every parent render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Play the exit animation before the parent drops the card, so it slides
  // out instead of vanishing.
  const startLeave = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => onDismissRef.current(), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (leaving || paused) return;
    const t = setTimeout(startLeave, action ? DISMISS_WITH_ACTION_MS : DISMISS_MS);
    return () => clearTimeout(t);
  }, [leaving, paused, action, startLeave]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("toast", leaving && "toast--leaving", className)}
      // Hovering pauses the countdown: a card carrying a link must not
      // disappear from under the pointer on its way to being clicked.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast__icon">
        <CheckIcon size={14} />
      </span>
      <span className="toast__message">{message}</span>
      {action ? (
        action.href ? (
          <Link className="toast__action" href={action.href} onClick={action.onClick}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className="toast__action" onClick={action.onClick}>
            {action.label}
          </button>
        )
      ) : null}
      <IconButton aria-label="Dismiss notification" onClick={startLeave}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}
