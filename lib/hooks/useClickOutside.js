import { useEffect } from "react";

/**
 * Close handler for click-outside detection.
 * @param {React.RefObject} ref - Element to detect clicks outside of
 * @param {Function} onClose - Callback when clicking outside
 * @param {boolean} enabled - Only active when true
 */
export function useClickOutside(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, onClose, enabled]);
}

/**
 * Close handler for Escape key.
 * @param {Function} onClose - Callback when Escape is pressed
 * @param {boolean} enabled - Only active when true
 */
export function useEscapeKey(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, enabled]);
}
