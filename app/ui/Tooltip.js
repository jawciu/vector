"use client";

import { useState, useRef } from "react";

/**
 * Tooltip that uses fixed positioning to escape overflow containers.
 * Wrap any element — tooltip text comes from the `label` or `lines` prop.
 */
export default function Tooltip({ label, lines, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const hasContent = label || (lines && lines.length > 0);
  if (!hasContent) return children;

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      });
    }
    setVisible(true);
  }

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      style={{ position: "relative" }}
    >
      {children}
      {visible && (
        <span
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Tooltip body */}
          <span
            style={{
              padding: "6px 12px",
              background: "var(--surface-hover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 400,
              whiteSpace: "nowrap",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {lines
              ? lines.map((line, i) => <span key={i}>{line}</span>)
              : label}
          </span>
          {/* Arrow */}
          <span
            style={{
              width: 10,
              height: 10,
              background: "var(--surface-hover)",
              border: "1px solid var(--border)",
              borderTop: "none",
              borderLeft: "none",
              transform: "rotate(45deg)",
              marginTop: -6,
            }}
          />
        </span>
      )}
    </span>
  );
}
