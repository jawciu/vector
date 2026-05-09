"use client";

import { forwardRef, useEffect, useRef } from "react";

/**
 * Slide-in right-edge drawer primitive. Extracted from the kanban
 * TaskDrawer so other surfaces (MeetingDrawer etc.) match the kanban
 * look — same fixed positioning, slide animation, dimensions, and
 * background — without each rebuilding the shell.
 *
 * Behaviour:
 *   - Renders a fixed-positioned panel anchored to the right edge.
 *   - Slide-in / slide-out via the `.task-drawer` + `.task-drawer--open`
 *     CSS pair already defined in globals.css.
 *   - The component stays mounted while `open` toggles so the slide
 *     animation has time to play. Caller decides whether to also unmount
 *     the wrapper later (most callers just keep it mounted).
 *   - ESC always closes.
 *   - Outside-click closes when `useClickOutside` is true (the default).
 *     The kanban TaskDrawer opts out (`useClickOutside={false}`) because
 *     its parent runs custom click logic — clicking another task card
 *     while the drawer is open should swap, not close.
 *   - A close button (chevron-back icon, top-right) is rendered by default.
 *     Pass `closeButton={false}` to opt out (rare).
 *   - forwardRef exposes the panel's DOM node so parents can do their
 *     own `contains()` checks for custom outside-click rules.
 *
 * Props:
 *   open            — boolean controlling the slide-in state.
 *   onClose         — () => void; called by ESC, outside-click, and the close button.
 *   width           — px (default 520).
 *   topOffset       — px from viewport top (default 44 — clears the global nav).
 *   useClickOutside — default true. Pass false if the parent owns it.
 *   closeButton     — default true. Render the built-in close button.
 *   className       — extra classes on the panel.
 *   children        — drawer contents. Always rendered while the panel
 *                     is mounted (the animation needs DOM presence).
 */
const Drawer = forwardRef(function Drawer(
  {
    open,
    onClose,
    width = 520,
    topOffset = 44,
    useClickOutside = true,
    closeButton = true,
    className = "",
    background = "var(--bg)",
    children,
    ...rest
  },
  forwardedRef
) {
  const localRef = useRef(null);

  function setRef(node) {
    localRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  // ESC closes
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Outside-click closes (opt-in)
  useEffect(() => {
    if (!open || !useClickOutside) return;
    function onClick(e) {
      if (localRef.current && !localRef.current.contains(e.target)) onClose?.();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, useClickOutside, onClose]);

  return (
    <div
      {...rest}
      ref={setRef}
      className={`task-drawer${open ? " task-drawer--open" : ""}${className ? ` ${className}` : ""}`}
      style={{
        position: "fixed",
        top: topOffset,
        right: 0,
        bottom: 0,
        width,
        background,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      {closeButton && open && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex items-center justify-center w-5 h-5 rounded icon-btn"
          style={{
            position: "absolute",
            top: 18,
            right: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          <DrawerCloseIcon />
        </button>
      )}
      {children}
    </div>
  );
});

function DrawerCloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <path d="M1.32129 10.1182L6.2296 5.40892L1.32129 0.600098" stroke="currentColor" strokeWidth="1.06126" strokeLinecap="round" />
      <path d="M9.67871 0.583496L9.67871 10.4167" stroke="currentColor" strokeWidth="1.06126" strokeLinecap="round" />
    </svg>
  );
}

export default Drawer;
