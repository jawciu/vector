"use client";

import { useState } from "react";
import Button from "../ui/Button";

export default function PhaseHeader({ phase, onPhaseUpdated, onPhaseDeleted }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(phase.name);
  const [targetDate, setTargetDate] = useState(phase.targetDate ? phase.targetDate.split("T")[0] : "");

  const progress = phase.taskCount > 0 ? Math.round((phase.doneCount / phase.taskCount) * 100) : 0;

  async function handleSave() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/phases/${phase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          targetDate: targetDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update phase");
      const updated = await res.json();
      if (onPhaseUpdated) onPhaseUpdated(updated);
      setIsEditing(false);
    } catch {
      // keep editing on error
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleComplete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/phases/${phase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isComplete: !phase.isComplete }),
      });
      if (!res.ok) throw new Error("Failed to update phase");
      const updated = await res.json();
      if (onPhaseUpdated) onPhaseUpdated(updated);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
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

  function handleCancel() {
    setName(phase.name);
    setTargetDate(phase.targetDate ? phase.targetDate.split("T")[0] : "");
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="text-base font-bold outline-none"
          style={{
            background: "transparent",
            color: "var(--text)",
            border: "none",
            borderBottom: "1px solid var(--action)",
            paddingBottom: 2,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="text-xs outline-none"
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "none",
            colorScheme: "dark",
          }}
        />
        <div className="flex gap-2 items-center">
          <Button size="xs" onClick={handleSave} disabled={loading}>
            Save
          </Button>
          <button
            onClick={handleCancel}
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="text-xs font-medium ml-auto"
            style={{ color: "var(--danger)" }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h2
          className="text-base font-bold cursor-pointer"
          style={{ color: "var(--text)" }}
          onClick={() => setIsEditing(true)}
        >
          {phase.name}
        </h2>
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {phase.taskCount}
        </span>
        {phase.isComplete && (
          <span
            className="text-[10px] font-medium rounded px-1.5 py-0.5"
            style={{ background: "var(--success)", color: "var(--text-dark)" }}
          >
            Complete
          </span>
        )}
        <button
          onClick={handleToggleComplete}
          disabled={loading}
          className="text-[10px] ml-auto"
          style={{ color: "var(--text-muted)" }}
          title={phase.isComplete ? "Mark incomplete" : "Mark complete"}
        >
          {phase.isComplete ? "Undo" : "Complete"}
        </button>
      </div>

      {/* Progress bar */}
      {phase.taskCount > 0 && (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 4, background: "var(--border)" }}
          >
            <div
              className="rounded-full transition-all"
              style={{
                width: `${progress}%`,
                height: "100%",
                background: progress === 100 ? "var(--success)" : "var(--action)",
              }}
            />
          </div>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {phase.doneCount}/{phase.taskCount}
          </span>
        </div>
      )}

      {phase.targetDate && (
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Target: {new Date(phase.targetDate).toLocaleDateString("en-GB", {
            day: "numeric", month: "short",
          })}
        </span>
      )}
    </div>
  );
}
