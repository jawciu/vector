"use client";

import { useState } from "react";
import PeoplePicker from "./PeoplePicker";
import Button from "../ui/Button";

const TASK_STATUSES = ["Not started", "In progress", "Under investigation", "Blocked", "Done"];
const PRIORITIES = ["low", "medium", "high"];

export default function CreateTaskCard({
  onboardingId,
  phaseId,
  onTaskCreated,
  people = [],
  isExpanded,
  onExpand,
  onCollapse,
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    status: "Not started",
    priority: null,
    due: "",
    waitingOn: "",
    owner: "",
    notes: "",
  });

  // Controlled vs uncontrolled expansion
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded;

  function expand() {
    if (isExpanded !== undefined) {
      if (onExpand) onExpand();
    } else {
      setInternalExpanded(true);
    }
  }

  function collapse() {
    setFormData({ title: "", status: "Not started", priority: null, due: "", waitingOn: "", owner: "", notes: "" });
    setError("");
    if (isExpanded !== undefined) {
      if (onCollapse) onCollapse();
    } else {
      setInternalExpanded(false);
    }
  }

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingId,
          phaseId,
          title: formData.title,
          status: formData.status,
          priority: formData.priority,
          due: formData.due,
          waitingOn: formData.waitingOn,
          owner: formData.owner,
          notes: formData.notes,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create task");
      }

      const newTask = await response.json();
      collapse();
      if (onTaskCreated) onTaskCreated(newTask);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={expand}
        className="flex items-center gap-1 w-full text-sm transition-colors hover:opacity-80"
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          padding: "8px 16px",
          background: "none",
          cursor: "pointer",
          color: "var(--text)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--text-muted)" }}>
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Add task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg mx-1"
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        padding: "12px 16px",
      }}
    >
      {error && (
        <div
          className="text-xs px-2 py-1.5 rounded"
          style={{
            color: "var(--danger)",
            background: "rgba(255, 137, 155, 0.1)",
            border: "1px solid var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="Task title"
        value={formData.title}
        onChange={(e) => handleChange("title", e.target.value)}
        required
        autoFocus
        className="py-1 px-0 text-sm w-full outline-none transition-colors"
        style={{ border: "none", background: "transparent", color: "var(--text)" }}
      />

      {/* Priority toggle */}
      <div className="flex items-center gap-1">
        <span className="text-xs mr-1" style={{ color: "var(--text-muted)" }}>Priority:</span>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handleChange("priority", formData.priority === p ? null : p)}
            className="text-xs font-medium rounded px-2 py-0.5 capitalize"
            style={{
              background: formData.priority === p ? "var(--surface-hover)" : "transparent",
              color: formData.priority === p ? "var(--text)" : "var(--text-muted)",
              border: formData.priority === p ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Status selector */}
      <select
        value={formData.status}
        onChange={(e) => handleChange("status", e.target.value)}
        className="py-1 px-0 text-xs w-full outline-none"
        style={{ border: "none", background: "transparent", color: "var(--text-muted)" }}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Due date */}
      <div className="flex items-center gap-2 py-1">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
          <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <line x1="4" y1="0.5" x2="4" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="10" y1="0.5" x2="10" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <input
          type="date"
          value={formData.due}
          onChange={(e) => handleChange("due", e.target.value)}
          className="text-xs flex-1 outline-none transition-colors"
          style={{ border: "none", background: "transparent", color: "var(--text-muted)", colorScheme: "dark" }}
        />
      </div>

      <PeoplePicker
        value={formData.waitingOn}
        onChange={(value) => handleChange("waitingOn", value)}
        placeholder="Waiting on"
        people={people}
      />

      <PeoplePicker
        value={formData.owner}
        onChange={(value) => handleChange("owner", value)}
        placeholder="Owner"
        people={people}
      />

      <textarea
        placeholder="Notes"
        value={formData.notes}
        onChange={(e) => handleChange("notes", e.target.value)}
        rows={2}
        className="py-1 px-0 text-xs w-full resize-vertical outline-none transition-colors"
        style={{ border: "none", background: "transparent", color: "var(--text-muted)" }}
      />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Creating…" : "Create"}
        </Button>
        <Button variant="secondary" size="sm" onClick={collapse} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
