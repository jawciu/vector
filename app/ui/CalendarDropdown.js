"use client";

import { useEffect, useRef } from "react";

/**
 * CalendarDropdown — DS primitive
 *
 * Custom date picker styled to match the design system.
 * Positioned absolutely below its parent (use inside a relative container).
 *
 * Props:
 *   value            — selected date string (YYYY-MM-DD) or ""
 *   viewDate         — Date object controlling which month is displayed
 *   onViewDateChange — callback to update viewDate
 *   onChange          — called with YYYY-MM-DD string when a day is picked
 *   onClear          — called when "Clear" is clicked
 *   onClose          — called on outside click
 */

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarDropdown({ value, viewDate, onViewDateChange, onChange, onClear, onClose }) {
  const ref = useRef(null);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Build calendar grid (Monday-start)
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, outside: true, date: new Date(year, month - 1, daysInPrev - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false, date: new Date(year, month, d) });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, outside: true, date: new Date(year, month + 1, d) });
    }
  }

  const today = new Date();
  const todayStr = toDateStr(today);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 flex flex-col"
      style={{
        marginTop: 4,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 12,
        minWidth: 260,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          {MONTHS[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onViewDateChange(new Date(year, month - 1, 1))}
            className="flex items-center justify-center w-6 h-6 rounded icon-btn"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onViewDateChange(new Date(year, month + 1, 1))}
            className="flex items-center justify-center w-6 h-6 rounded icon-btn"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 text-center" style={{ marginBottom: 4 }}>
        {DAYS.map((d) => (
          <span key={d} className="text-xs font-medium py-1" style={{ color: "var(--text-muted)" }}>{d}</span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 text-center">
        {cells.map((cell, i) => {
          const dateStr = toDateStr(cell.date);
          const isSelected = dateStr === value;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(dateStr)}
              className="flex items-center justify-center text-sm rounded-lg transition-colors"
              style={{
                width: 32,
                height: 32,
                margin: "1px auto",
                border: isToday && !isSelected ? "1px solid var(--border)" : "1px solid transparent",
                background: isSelected ? "var(--action)" : "transparent",
                color: isSelected ? "var(--action-text)" : cell.outside ? "var(--icon-tertiary)" : "var(--text)",
                fontWeight: isSelected ? 600 : 400,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={onClear}
          className="text-xs transition-colors"
          style={{ color: "var(--action)", background: "none", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--action-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--action)"; }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onChange(todayStr)}
          className="text-xs transition-colors"
          style={{ color: "var(--action)", background: "none", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--action-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--action)"; }}
        >
          Today
        </button>
      </div>
    </div>
  );
}
