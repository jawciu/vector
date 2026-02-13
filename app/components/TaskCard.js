"use client";

import { useState } from "react";

const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  // Display mode
  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="flex flex-col gap-3 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "12px 16px",
        }}
      >
        <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
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
              Waiting on: <span style={{ color: "var(--text)" }}>{task.waitingOn}</span>
            </div>
          )}
          {task.owner && (
            <div style={{ color: "var(--text-muted)" }}>
              Owner: <span style={{ color: "var(--text)" }}>{task.owner}</span>
            </div>
          )}
          {task.notes && (
            <div style={{ color: "var(--text-muted)" }}>
              Notes: <span style={{ color: "var(--text)" }}>{task.notes}</span>
            </div>
          )}
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
        className="py-2.5 px-3 rounded-lg text-sm w-full"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

      <select
        value={formData.status}
        onChange={(e) => handleChange("status", e.target.value)}
        className="py-2.5 px-3 rounded-lg text-xs w-full"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Due (e.g., Mon, Tue)"
        value={formData.due}
        onChange={(e) => handleChange("due", e.target.value)}
        className="py-2.5 px-3 rounded-lg text-xs w-full"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

      <input
        type="text"
        placeholder="Waiting on"
        value={formData.waitingOn}
        onChange={(e) => handleChange("waitingOn", e.target.value)}
        className="py-2.5 px-3 rounded-lg text-xs w-full"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

      <input
        type="text"
        placeholder="Owner"
        value={formData.owner}
        onChange={(e) => handleChange("owner", e.target.value)}
        className="py-2.5 px-3 rounded-lg text-xs w-full"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

      <textarea
        placeholder="Notes"
        value={formData.notes}
        onChange={(e) => handleChange("notes", e.target.value)}
        rows={2}
        className="py-2.5 px-3 rounded-lg text-xs w-full resize-vertical"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

      <div className="flex gap-2 justify-between">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || deleting}
            className="py-2.5 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
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
            className="py-2.5 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
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
          className="py-2.5 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
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
