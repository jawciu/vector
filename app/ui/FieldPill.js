"use client";

/**
 * FieldPill — DS primitive
 *
 * Small bordered pill for inline field selectors (date, priority, status, etc.).
 * Grows to fill available space (flex-1).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — highlights bg when the pill's dropdown is open
 *   onClick   — click handler (typically toggles a dropdown)
 *   children  — custom content (overrides label)
 */
export default function FieldPill({ icon, label, children, onClick, active }) {
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
    >
      {icon}
      {children || (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</span>
      )}
    </div>
  );
}
