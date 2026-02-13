"use client";

import { useState } from "react";

export default function CreateTaskCard({ onboardingId, defaultStatus, onTaskCreated }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    due: "",
    waitingOn: "",
    owner: "",
    notes: "",
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
          status: defaultStatus,
          ...formData,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create task");
      }

      const newTask = await response.json();

      // Reset form and collapse
      setFormData({ title: "", due: "", waitingOn: "", owner: "", notes: "" });
      setIsExpanded(false);

      // Notify parent
      if (onTaskCreated) {
        onTaskCreated(newTask);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setFormData({ title: "", due: "", waitingOn: "", owner: "", notes: "" });
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
        className="py-2.5 px-3 rounded-lg text-sm w-full"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="py-2.5 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          style={{
            background: "var(--action)",
            color: "#0a0a0a",
          }}
        >
          {loading ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
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
    </form>
  );
}
