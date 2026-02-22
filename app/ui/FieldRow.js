"use client";

/**
 * FieldRow — DS primitive
 *
 * Full-width bordered row for field selectors (owner, members, dependencies, etc.).
 *
 * Props:
 *   icon      — left-side icon element
 *   label     — fallback text when no children
 *   active    — highlights bg when the row's dropdown is open
 *   onClick   — click handler
 *   children  — custom content (overrides label)
 */
export default function FieldRow({ icon, label, children, onClick, active }) {
  return (
    <div
      className="flex items-center gap-1 w-full rounded-lg cursor-pointer transition-colors"
      style={{
        border: "1px solid var(--button-secondary-border)",
        background: active ? "var(--surface-hover)" : "var(--bg-elevated)",
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
