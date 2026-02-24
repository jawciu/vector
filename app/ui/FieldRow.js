"use client";

/**
 * FieldRow — DS primitive (drawer detail view)
 *
 * Clean label+value row with no default border. Border + background appear
 * only when active (dropdown open). Content-hugging (inline-flex, not full-width).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — shows border + bg when the row's dropdown is open
 *   onClick   — click handler
 *   children  — custom content (overrides label)
 */
export default function FieldRow({ icon, label, children, onClick, active }) {
  return (
    <div
      className="field-row inline-flex items-center gap-2 rounded-lg cursor-pointer"
      data-active={active ? "true" : undefined}
      style={{ padding: "4px 8px", minHeight: 26 }}
      onClick={onClick}
    >
      {icon}
      {children || (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</span>
      )}
    </div>
  );
}
