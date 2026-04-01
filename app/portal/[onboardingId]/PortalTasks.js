"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/app/components/StatusBadge";

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

function InlineError({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      className="flex items-center gap-2 text-xs rounded-md mt-2"
      style={{
        padding: "6px 10px",
        background: "rgba(255, 137, 155, 0.08)",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function TaskRow({ task, onStatusChange, onFileUploaded, onCommentAdded, contactName, onSessionExpired }) {
  const [toggling, setToggling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Reset draft comment and error when task is collapsed
  useEffect(() => {
    if (!expanded) {
      setCommentText("");
      setError(null);
    }
  }, [expanded]);

  const isDone = task.status === "Done";
  const overdue = isOverdue(task);

  async function handleApiCall(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) {
      onSessionExpired();
      throw new Error("Session expired");
    }
    return res;
  }

  async function handleToggleDone() {
    setToggling(true);
    setError(null);
    try {
      const newStatus = isDone ? (task.previousStatus || "Not started") : "Done";
      const body = isDone
        ? { status: newStatus }
        : { status: "Done", previousStatus: task.status };

      const res = await handleApiCall(`/api/portal/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update task");
      }
      const updated = await res.json();
      onStatusChange(task.id, updated);
    } catch (err) {
      if (err.message !== "Session expired") setError(err.message);
    } finally {
      setToggling(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await handleApiCall(`/api/portal/tasks/${task.id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const newFile = await res.json();
      onFileUploaded(task.id, newFile);
    } catch (err) {
      if (err.message !== "Session expired") setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await handleApiCall(`/api/portal/tasks/${task.id}/comments`, {
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
      if (err.message !== "Session expired") setError(err.message);
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
      {/* Main row — larger touch target */}
      <div
        className="flex items-center gap-3 cursor-pointer md:gap-4"
        style={{ padding: "12px 14px", minHeight: 48 }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox — 24x24 touch target */}
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleDone(); }}
          disabled={toggling}
          className="flex-shrink-0 flex items-center justify-center rounded"
          style={{
            width: 22,
            height: 22,
            border: `1.5px solid ${isDone ? "var(--success)" : "var(--border)"}`,
            background: isDone ? "var(--success)" : "transparent",
            cursor: "pointer",
          }}
        >
          {isDone && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
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
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

        {/* Status badge — same component as main platform */}
        <div className="shrink-0">
          <StatusBadge status={task.status} />
        </div>

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

      {/* Inline error — always visible when present */}
      {error && (
        <div style={{ padding: "0 14px 8px" }}>
          <InlineError message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
          }}
        >
          <div className="md:flex md:gap-6">
            {/* Left column: description + files */}
            <div className="md:flex-1 md:min-w-0">
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
                    <a
                      key={f.id}
                      href={`/api/portal/tasks/${task.id}/files/${f.id}`}
                      className="flex items-center gap-2 rounded-md"
                      style={{ padding: "6px 4px", textDecoration: "none", minHeight: 36 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                        <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                        <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                      </svg>
                      <span className="text-xs truncate" style={{ color: "var(--action)" }}>
                        {f.fileName}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {(f.fileSize / 1024).toFixed(0)} KB
                      </span>
                    </a>
                  ))}
                </div>
              )}

              {/* Upload button — larger touch target */}
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
                  padding: "6px 0",
                  minHeight: 36,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 9V3M3.5 5.5L6 3l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 9.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {uploading ? "Uploading…" : "Upload file"}
              </button>
            </div>

            {/* Right column (desktop) / below (mobile): Comments */}
            <div className="mt-3 md:mt-0 md:flex-1 md:min-w-0">
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
                    padding: "8px 10px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    minHeight: 36,
                  }}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || submitting}
                  className="text-xs font-medium rounded shrink-0"
                  style={{
                    padding: "8px 14px",
                    background: commentText.trim() ? "var(--action)" : "var(--surface-hover)",
                    color: commentText.trim() ? "var(--action-text)" : "var(--text-muted)",
                    border: "none",
                    cursor: commentText.trim() ? "pointer" : "default",
                    minHeight: 36,
                  }}
                >
                  {submitting ? "…" : "Send"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseGroup({ phaseName, tasks, onStatusChange, onFileUploaded, onCommentAdded, contactName, onSessionExpired }) {
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
            onSessionExpired={onSessionExpired}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ filter, myOnly }) {
  const messages = {
    active: {
      title: myOnly ? "No active tasks assigned to you" : "No active tasks",
      body: myOnly
        ? "When tasks are assigned to you, they\u2019ll appear here."
        : "All tasks are either done or haven\u2019t been created yet.",
    },
    done: {
      title: myOnly ? "No completed tasks yet" : "No completed tasks",
      body: "Mark tasks as done by checking the checkbox next to them.",
    },
    all: {
      title: myOnly ? "No tasks assigned to you" : "No tasks yet",
      body: myOnly
        ? "Your vendor hasn\u2019t assigned any tasks to you yet."
        : "Tasks will appear here once your vendor sets up the onboarding.",
    },
  };

  const msg = messages[filter] || messages.all;

  return (
    <div className="text-center" style={{ padding: "40px 16px" }}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: "var(--text-muted)", margin: "0 auto 12px" }}
      >
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium" style={{ color: "var(--text)", marginBottom: 4 }}>
        {msg.title}
      </p>
      <p className="text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
        {msg.body}
      </p>
    </div>
  );
}

export default function PortalTasks({ tasks: initialTasks, myOnly, contactName }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("active"); // active | done | all
  const router = useRouter();

  function handleSessionExpired() {
    router.push("/portal/auth?error=expired");
  }

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
      {/* Filter pills — larger touch targets */}
      <div className="flex gap-1.5 mb-4">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className="text-xs font-medium rounded-full"
            style={{
              padding: "6px 14px",
              minHeight: 32,
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
        <EmptyState filter={filter} myOnly={myOnly} />
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
              onSessionExpired={handleSessionExpired}
            />
          ))}
        </div>
      )}
    </div>
  );
}
