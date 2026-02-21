"use client";

import { useState, useRef, useEffect } from "react";
import { MenuList, MenuOption } from "./Menu";

export default function PhaseHeader({ phase, onPhaseUpdated, onPhaseDeleted, onAddTask }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(phase.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(phase.name);
      setIsEditing(false);
      return;
    }
    if (trimmed === phase.name) {
      setIsEditing(false);
      return;
    }
    try {
      const res = await fetch(`/api/phases/${phase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onPhaseUpdated) onPhaseUpdated(updated);
    } catch {
      setName(phase.name);
    } finally {
      setIsEditing(false);
    }
  }

  function handleCancel() {
    setName(phase.name);
    setIsEditing(false);
  }

  async function handleDelete() {
    setMenuOpen(false);
    if (!confirm(`Delete "${phase.name}" phase? It must have no tasks.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/phases/${phase.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete phase");
        return;
      }
      if (onPhaseDeleted) onPhaseDeleted(phase.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center px-4 py-1" style={{ gap: 6 }}>
      {/* 6-dot drag handle */}
      <svg
        width="8"
        height="14"
        viewBox="0 0 8 14"
        fill="none"
        style={{ color: "var(--text-muted)", flexShrink: 0, cursor: "grab", opacity: 0.5 }}
      >
        <circle cx="2" cy="2" r="1.2" fill="currentColor" />
        <circle cx="6" cy="2" r="1.2" fill="currentColor" />
        <circle cx="2" cy="7" r="1.2" fill="currentColor" />
        <circle cx="6" cy="7" r="1.2" fill="currentColor" />
        <circle cx="2" cy="12" r="1.2" fill="currentColor" />
        <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      </svg>

      {/* Phase name (inline edit) + task count */}
      <div className="flex items-center flex-1 min-w-0" style={{ gap: 4 }}>
        {isEditing ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="text-sm font-semibold outline-none flex-1 min-w-0"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "none",
              borderBottom: "1px solid var(--action)",
              paddingBottom: 1,
              lineHeight: 1,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            onBlur={handleSave}
          />
        ) : (
          <button
            className="text-sm font-semibold text-left truncate"
            style={{ color: "var(--text)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
            onClick={() => setIsEditing(true)}
          >
            {phase.name}
          </button>
        )}
        <span className="text-sm flex-shrink-0" style={{ color: "var(--text-muted)", lineHeight: 1 }}>
          {phase.taskCount}
        </span>
      </div>

      {/* Meatball menu */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className={`icon-btn flex items-center justify-center w-5 h-5 rounded-full${menuOpen ? " icon-btn--active" : ""}`}
          aria-label="Phase options"
          disabled={loading}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>

        {menuOpen && (
          <MenuList style={{ left: "auto", right: 0, width: 160 }}>
            <MenuOption
              onClick={handleDelete}
              style={{ color: "var(--danger)", fontWeight: 400 }}
            >
              Delete phase
            </MenuOption>
          </MenuList>
        )}
      </div>

      {/* Plus icon */}
      <button
        type="button"
        onClick={() => onAddTask && onAddTask()}
        className="flex items-center justify-center w-5 h-5 rounded icon-btn"
        style={{ flexShrink: 0 }}
        aria-label="Add task"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="5.5" y1="1" x2="5.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
