"use client";

import { useState } from "react";
import PeoplePicker from "./PeoplePicker";

const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted, people = [] }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    title: task.title,
    status: task.status,
    due: task.due,
    waitingOn: task.waitingOn,
    owner: task.owner || "",
    notes: task.notes || "",
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
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to update task");
      }

      const updatedTask = await response.json();

      // Exit edit mode
      setIsEditing(false);

      // Notify parent
      if (onTaskUpdated) {
        onTaskUpdated(updatedTask);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    // Reset form to original task data
    setFormData({
      title: task.title,
      status: task.status,
      due: task.due,
      waitingOn: task.waitingOn,
      owner: task.owner || "",
      notes: task.notes || "",
    });
    setError("");
    setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete task");
      }

      // Notify parent
      if (onTaskDeleted) {
        onTaskDeleted(task.id);
      }
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  async function handleComplete(e) {
    e.stopPropagation();
    if (completing) return;

    setCompleting(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to complete task");
      }

      const updatedTask = await response.json();

      // Wait for the green animation to play, then notify parent
      setTimeout(() => {
        if (onTaskUpdated) {
          onTaskUpdated(updatedTask);
        }
      }, 800);
    } catch (err) {
      setError(err.message);
      setCompleting(false);
    }
  }

  // Display mode
  if (!isEditing) {
    const isDone = task.status === "Done" || completing;

    return (
      <div
        className={`task-card flex items-start gap-3 rounded-lg cursor-pointer hover:opacity-80${completing ? " task-completing" : ""}`}
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "12px 16px",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        {/* Tick circle */}
        <button
          type="button"
          onClick={handleComplete}
          className="tick-circle flex-shrink-0"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: `1.5px solid ${isDone ? "var(--success)" : "var(--text-muted)"}`,
            background: isDone ? "var(--success)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.25s ease",
            marginTop: 1,
          }}
          aria-label="Mark as done"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{
              opacity: isDone ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          >
            <path
              d="M2 5.5L4 7.5L8 3"
              stroke="var(--text-dark)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div
          className="flex-1 flex flex-col gap-3"
          onClick={() => setIsEditing(true)}
        >
          <div
            className="text-sm font-medium"
            style={{
              color: isDone ? "var(--text-muted)" : "var(--text)",
              textDecoration: isDone ? "line-through" : "none",
              transition: "color 0.25s ease",
            }}
          >
            {task.title}
          </div>

          <div className="flex flex-col gap-1 text-xs">
            {task.due && (
              <div style={{ color: "var(--text-muted)" }}>
                Due: {task.due}
              </div>
            )}
            {task.waitingOn && (
              <div style={{ color: "var(--text-muted)" }}>
                Waiting on: <span style={{ color: isDone ? "var(--text-muted)" : "var(--text)" }}>{task.waitingOn}</span>
              </div>
            )}
            {task.owner && (
              <div style={{ color: "var(--text-muted)" }}>
                Owner: <span style={{ color: isDone ? "var(--text-muted)" : "var(--text)" }}>{task.owner}</span>
              </div>
            )}
            {task.notes && (
              <div style={{ color: "var(--text-muted)" }}>
                Notes: <span style={{ color: isDone ? "var(--text-muted)" : "var(--text)" }}>{task.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Edit mode
  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-3 rounded-lg"
      style={{
        border: "1px solid var(--action)",
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
        style={{
          border: "none",
          background: "transparent",
          color: "var(--text-muted)",
        }}
        onFocus={(e) => e.target.style.color = "var(--text)"}
        onBlur={(e) => e.target.style.color = formData.title ? "var(--text)" : "var(--text-muted)"}
      />

      <select
        value={formData.status}
        onChange={(e) => handleChange("status", e.target.value)}
        className="py-2 px-0 text-xs w-full outline-none transition-colors"
        style={{
          border: "none",
          background: "transparent",
          color: "var(--text)",
        }}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>

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
          style={{
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            colorScheme: "dark",
          }}
          onFocus={(e) => e.target.style.color = "var(--text)"}
          onBlur={(e) => e.target.style.color = formData.due ? "var(--text)" : "var(--text-muted)"}
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
        className="py-2 px-0 text-xs w-full resize-vertical outline-none transition-colors"
        style={{
          border: "none",
          background: "transparent",
          color: "var(--text-muted)",
        }}
        onFocus={(e) => e.target.style.color = "var(--text)"}
        onBlur={(e) => e.target.style.color = formData.notes ? "var(--text)" : "var(--text-muted)"}
      />

      <div className="flex gap-2 justify-between">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || deleting}
            className="py-1 px-2 w-fit h-fit rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{
              background: "var(--action)",
              color: "#0a0a0a",
            }}
          >
            {loading ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading || deleting}
            className="py-1 px-2 w-fit h-fit rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading || deleting}
          className="py-1 px-2 w-fit h-fit rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          style={{
            background: "var(--danger)",
            color: "var(--text-dark)",
          }}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </form>
  );
}
