"use client";

import { useState, useRef, useEffect } from "react";
import { MenuList, MenuOption } from "./Menu";
import IconButton from "@/app/ui/IconButton";

export default function PhaseHeader({ phase, onPhaseUpdated, onPhaseDeleted, onAddTask, dragListeners }) {
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
    <div className="flex items-center pl-4 pr-2 py-1" style={{ gap: 6 }}>
      {/* 6-dot drag handle */}
      <svg {...dragListeners} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, cursor: "default", touchAction: "none" }}>
        <path d="M4.125 2.4375C4.43566 2.4375 4.6875 2.18566 4.6875 1.875C4.6875 1.56434 4.43566 1.3125 4.125 1.3125C3.81434 1.3125 3.5625 1.56434 3.5625 1.875C3.5625 2.18566 3.81434 2.4375 4.125 2.4375Z" stroke="var(--text-muted)" strokeWidth="1.10321" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4.125 6.5625C4.43566 6.5625 4.6875 6.31066 4.6875 6C4.6875 5.68934 4.43566 5.4375 4.125 5.4375C3.81434 5.4375 3.5625 5.68934 3.5625 6C3.5625 6.31066 3.81434 6.5625 4.125 6.5625Z" stroke="var(--text-muted)" strokeWidth="1.10321" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4.125 10.6875C4.43566 10.6875 4.6875 10.4357 4.6875 10.125C4.6875 9.81434 4.43566 9.5625 4.125 9.5625C3.81434 9.5625 3.5625 9.81434 3.5625 10.125C3.5625 10.4357 3.81434 10.6875 4.125 10.6875Z" stroke="var(--text-muted)" strokeWidth="1.10321" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7.87207 2.4375C8.18273 2.4375 8.43457 2.18566 8.43457 1.875C8.43457 1.56434 8.18273 1.3125 7.87207 1.3125C7.56141 1.3125 7.30957 1.56434 7.30957 1.875C7.30957 2.18566 7.56141 2.4375 7.87207 2.4375Z" stroke="var(--text-muted)" strokeWidth="1.10321" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7.87207 6.5625C8.18273 6.5625 8.43457 6.31066 8.43457 6C8.43457 5.68934 8.18273 5.4375 7.87207 5.4375C7.56141 5.4375 7.30957 5.68934 7.30957 6C7.30957 6.31066 7.56141 6.5625 7.87207 6.5625Z" stroke="var(--text-muted)" strokeWidth="1.10321" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7.87207 10.6875C8.18273 10.6875 8.43457 10.4357 8.43457 10.125C8.43457 9.81434 8.18273 9.5625 7.87207 9.5625C7.56141 9.5625 7.30957 9.81434 7.30957 10.125C7.30957 10.4357 7.56141 10.6875 7.87207 10.6875Z" stroke="var(--text-muted)" strokeWidth="1.10321" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      {/* Phase name (inline edit) + task count */}
      <div className="flex items-center flex-1 min-w-0" style={{ gap: 4 }}>
        {isEditing ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="text-sm font-semibold outline-none"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "none",
              borderBottom: "1px solid var(--action)",
              paddingBottom: 1,
              lineHeight: 1,
              fieldSizing: "content",
              minWidth: "2ch",
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
        <IconButton
          onClick={() => setMenuOpen((o) => !o)}
          isActive={menuOpen}
          disabled={loading}
          aria-label="Phase options"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </IconButton>

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
      <IconButton
        onClick={() => onAddTask && onAddTask()}
        aria-label="Add task"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="5.5" y1="1" x2="5.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </IconButton>
    </div>
  );
}
