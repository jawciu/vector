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
 *   - forwardRef exposes the panel's DOM node so parents can do their
 *     own `contains()` checks for custom outside-click rules.
 *
 * Props:
 *   open            — boolean controlling the slide-in state.
 *   onClose         — () => void; called by ESC and (optionally) outside-click.
 *   width           — px (default 520).
 *   topOffset       — px from viewport top (default 44 — clears the global nav).
 *   useClickOutside — default true. Pass false if the parent owns it.
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
    className = "",
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
        background: "var(--bg)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
});

export default Drawer;
