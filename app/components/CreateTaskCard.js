"use client";

import { useState } from "react";
import PeoplePicker from "./PeoplePicker";

export default function CreateTaskCard({ onboardingId, phaseId, onTaskCreated, people = [], allTasks = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    due: "",
    waitingOn: "",
    owner: "",
    notes: "",
    blockedByTaskId: "",
  });

  function handleChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
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
          due: formData.due,
          waitingOn: formData.waitingOn,
          owner: formData.owner,
          notes: formData.notes,
          blockedByTaskId: formData.blockedByTaskId || null,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create task");
      }

      const newTask = await response.json();

      setFormData({ title: "", due: "", waitingOn: "", owner: "", notes: "", blockedByTaskId: "" });
      setIsExpanded(false);

      if (onTaskCreated) onTaskCreated(newTask);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setFormData({ title: "", due: "", waitingOn: "", owner: "", notes: "", blockedByTaskId: "" });
    setError("");
    setIsExpanded(false);
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full text-left rounded-lg border border-dashed px-4 py-3 text-sm transition-colors hover:opacity-80"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-muted)",
        }}
      >
        + Add task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
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
        className="py-2 px-0 text-sm w-full outline-none transition-colors"
        style={{ border: "none", background: "transparent", color: "var(--text-muted)" }}
        onFocus={(e) => e.target.style.color = "var(--text)"}
        onBlur={(e) => e.target.style.color = formData.title ? "var(--text)" : "var(--text-muted)"}
      />

      <div className="flex items-center gap-2 py-2">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" style={{ color: "var(--text-muted)" }}/>
          <line x1="4" y1="0.5" x2="4" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ color: "var(--text-muted)" }}/>
          <line x1="10" y1="0.5" x2="10" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ color: "var(--text-muted)" }}/>
          <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1.2" style={{ color: "var(--text-muted)" }}/>
        </svg>
        <input
          type="date"
          value={formData.due}
          onChange={(e) => handleChange("due", e.target.value)}
          className="text-xs flex-1 outline-none transition-colors"
          style={{ border: "none", background: "transparent", color: "var(--text-muted)", colorScheme: "dark" }}
          onFocus={(e) => e.target.style.color = "var(--text)"}
          onBlur={(e) => e.target.style.color = formData.due ? "var(--text)" : "var(--text-muted)"}
        />
      </div>

      {/* Blocked by task picker */}
      {allTasks.length > 0 && (
        <select
          value={formData.blockedByTaskId}
          onChange={(e) => handleChange("blockedByTaskId", e.target.value)}
          className="py-2 px-0 text-xs w-full outline-none"
          style={{ border: "none", background: "transparent", color: "var(--text-muted)" }}
        >
          <option value="">Not blocked</option>
          {allTasks.map((t) => (
            <option key={t.id} value={t.id}>
              Blocked by: {t.title}
            </option>
          ))}
        </select>
      )}

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
        className="py-2 px-0 text-xs w-full resize-vertical outline-none transition-colors"
        style={{ border: "none", background: "transparent", color: "var(--text-muted)" }}
        onFocus={(e) => e.target.style.color = "var(--text)"}
        onBlur={(e) => e.target.style.color = formData.notes ? "var(--text)" : "var(--text-muted)"}
      />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="py-1 px-2 w-fit h-fit rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: "var(--action)", color: "#0a0a0a" }}
        >
          {loading ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="py-1 px-2 w-fit h-fit rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
