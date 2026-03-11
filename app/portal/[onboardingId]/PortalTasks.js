"use client";

import { useState, useRef } from "react";

const STATUS_COLORS = {
  Done: "var(--success)",
  "In progress": "var(--action)",
  "Under investigation": "var(--action)",
  Blocked: "var(--danger)",
  "Not started": "var(--text-muted)",
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(task) {
  if (task.status === "Done" || !task.due) return false;
  return new Date(task.due + "T23:59:59") < new Date();
}

function formatCommentTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TaskRow({ task, onStatusChange, onFileUploaded, onCommentAdded, contactName }) {
  const [toggling, setToggling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const isDone = task.status === "Done";
  const overdue = isOverdue(task);

  async function handleToggleDone() {
    setToggling(true);
    try {
      const newStatus = isDone ? (task.previousStatus || "Not started") : "Done";
      const body = isDone
        ? { status: newStatus }
        : { status: "Done", previousStatus: task.status };

      const res = await fetch(`/api/portal/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update task");
      const updated = await res.json();
      onStatusChange(task.id, updated);
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/portal/tasks/${task.id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      const newFile = await res.json();
      onFileUploaded(task.id, newFile);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add comment");
      }
      const newComment = await res.json();
      onCommentAdded(task.id, newComment);
      setCommentText("");
    } catch (err) {
      console.error("Comment error:", err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        style={{ padding: "10px 12px" }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleDone(); }}
          disabled={toggling}
          className="flex-shrink-0 flex items-center justify-center rounded"
          style={{
            width: 18,
            height: 18,
            border: `1.5px solid ${isDone ? "var(--success)" : "var(--border)"}`,
            background: isDone ? "var(--success)" : "transparent",
            cursor: "pointer",
          }}
        >
          {isDone && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm truncate"
            style={{
              color: isDone ? "var(--text-muted)" : "var(--text)",
              textDecoration: isDone ? "line-through" : "none",
            }}
          >
            {task.title}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {task.due && (
              <span
                className="text-[11px]"
                style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}
              >
                {overdue ? "Overdue · " : ""}{formatDate(task.due)}
              </span>
            )}
            {task.files.length > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {task.files.length} file{task.files.length !== 1 ? "s" : ""}
              </span>
            )}
            {task.commentCount > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {task.commentCount} comment{task.commentCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Status pill */}
        <span
          className="text-[10px] font-medium rounded-full shrink-0"
          style={{
            padding: "2px 8px",
            color: STATUS_COLORS[task.status] || "var(--text-muted)",
            border: `1px solid ${STATUS_COLORS[task.status] || "var(--border)"}`,
          }}
        >
          {task.status}
        </span>

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: "0 12px 12px",
            borderTop: "1px solid var(--border)",
            paddingTop: 10,
          }}
        >
          {task.description && (
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              {task.description}
            </p>
          )}

          {/* Files list */}
          {task.files.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                Files
              </div>
              {task.files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 py-1"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                    <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs truncate" style={{ color: "var(--text)" }}>
                    {f.fileName}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {(f.fileSize / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{
              color: "var(--action)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 9V3M3.5 5.5L6 3l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 9.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {uploading ? "Uploading…" : "Upload file"}
          </button>

          {/* Comments */}
          <div style={{ marginTop: 12 }}>
            <div className="text-[11px] font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              Comments{task.comments.length > 0 ? ` (${task.comments.length})` : ""}
            </div>

            {task.comments.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {task.comments.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-xs font-medium"
                        style={{ color: c.author === contactName ? "var(--action)" : "var(--text)" }}
                      >
                        {c.author}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {formatCommentTime(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 text-xs rounded outline-none"
                style={{
                  padding: "6px 8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submitting}
                className="text-xs font-medium rounded shrink-0"
                style={{
                  padding: "6px 12px",
                  background: commentText.trim() ? "var(--action)" : "var(--surface-hover)",
                  color: commentText.trim() ? "var(--action-text)" : "var(--text-muted)",
                  border: "none",
                  cursor: commentText.trim() ? "pointer" : "default",
                }}
              >
                {submitting ? "…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseGroup({ phaseName, tasks, onStatusChange, onFileUploaded, onCommentAdded, contactName }) {
  if (tasks.length === 0) return null;

  return (
    <div>
      <div
        className="text-xs font-semibold mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {phaseName}
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onStatusChange={onStatusChange}
            onFileUploaded={onFileUploaded}
            onCommentAdded={onCommentAdded}
            contactName={contactName}
          />
        ))}
      </div>
    </div>
  );
}

export default function PortalTasks({ tasks: initialTasks, myOnly, contactName }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("active"); // active | done | all

  function handleStatusChange(taskId, updatedTask) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: updatedTask.status, previousStatus: updatedTask.previousStatus }
          : t
      )
    );
  }

  function handleFileUploaded(taskId, newFile) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, files: [newFile, ...t.files] } : t
      )
    );
  }

  function handleCommentAdded(taskId, newComment) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, comments: [...t.comments, newComment], commentCount: t.commentCount + 1 }
          : t
      )
    );
  }

  const filtered = tasks.filter((t) => {
    if (myOnly && !t.isAssignedToMe) return false;
    if (filter === "active") return t.status !== "Done";
    if (filter === "done") return t.status === "Done";
    return true;
  });

  // Group by phase
  const phases = [];
  const phaseMap = new Map();
  for (const task of filtered) {
    const key = task.phase?.id || 0;
    if (!phaseMap.has(key)) {
      const group = { id: key, name: task.phase?.name || "No phase", sortOrder: task.phase?.sortOrder ?? 999, tasks: [] };
      phaseMap.set(key, group);
      phases.push(group);
    }
    phaseMap.get(key).tasks.push(task);
  }
  phases.sort((a, b) => a.sortOrder - b.sortOrder);

  const FILTERS = [
    { id: "active", label: "Active" },
    { id: "done", label: "Done" },
    { id: "all", label: "All" },
  ];

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-1.5 mb-4">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className="text-xs font-medium rounded-full"
            style={{
              padding: "4px 12px",
              background: filter === id ? "var(--action)" : "transparent",
              color: filter === id ? "var(--action-text)" : "var(--text-muted)",
              border: filter === id ? "none" : "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div
          className="text-sm text-center py-8"
          style={{ color: "var(--text-muted)" }}
        >
          {myOnly ? "No tasks assigned to you." : "No tasks found."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {phases.map((group) => (
            <PhaseGroup
              key={group.id}
              phaseName={group.name}
              tasks={group.tasks}
              onStatusChange={handleStatusChange}
              onFileUploaded={handleFileUploaded}
              onCommentAdded={handleCommentAdded}
              contactName={contactName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
