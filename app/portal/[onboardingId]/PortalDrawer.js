"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import Button from "@/app/ui/Button";
import { CalendarIcon, StatusIcon, OwnerIcon, PriorityIcon } from "@/app/ui/Icons";
import FieldRow from "@/app/ui/FieldRow";
import { STATUS_COLORS, TASK_STATUSES } from "@/lib/constants";
import { MenuList, MenuOption } from "@/app/components/Menu";

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1.32129 10.1182L6.2296 5.40892L1.32129 0.600098" stroke="currentColor" strokeWidth="1.06126" strokeLinecap="round" />
      <path d="M9.67871 0.583496L9.67871 10.4167" stroke="currentColor" strokeWidth="1.06126" strokeLinecap="round" />
    </svg>
  );
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M8 1.5H4a1.5 1.5 0 00-1.5 1.5v8A1.5 1.5 0 004 12.5h6a1.5 1.5 0 001.5-1.5V5L8 1.5z" stroke="var(--text-muted)" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M8 1.5V5h3.5" stroke="var(--text-muted)" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <g clipPath="url(#comment-drawer-clip)">
        <path
          d="M1.83778 1.24799C1.88502 1.24523 1.93284 1.24385 1.98125 1.24385H10.5418C11.2073 1.24385 11.8455 1.50821 12.316 1.97876C12.7866 2.44931 13.0509 3.08752 13.0509 3.75298V9.36163C13.0509 9.41004 13.0496 9.45806 13.0468 9.50569C13.3195 9.3324 13.544 9.09307 13.6996 8.80986C13.8551 8.52666 13.9366 8.20877 13.9365 7.88567V3.75298C13.9365 3.30718 13.8487 2.86575 13.6781 2.45389C13.5075 2.04202 13.2575 1.66779 12.9422 1.35256C12.627 1.03734 12.2528 0.787283 11.8409 0.616683C11.429 0.446083 10.9876 0.358276 10.5418 0.358276H3.45721C3.13421 0.358284 2.81644 0.439831 2.53335 0.59536C2.25026 0.750889 2.01101 0.975366 1.83778 1.24799ZM2.8314 13.5652C2.93767 13.6183 3.04984 13.6419 3.16202 13.6419H3.16792C3.32142 13.6419 3.47492 13.5947 3.6048 13.4943L6.58034 11.2804H10.5418C11.5986 11.2804 12.4606 10.4184 12.4606 9.36163V3.75298C12.4606 2.6962 11.5986 1.83424 10.5418 1.83424H1.98125C0.924461 1.83424 0.0625 2.6962 0.0625 3.75298V9.36163C0.0625 10.4184 0.924461 11.2804 1.98125 11.2804H2.42404V12.9039C2.42404 13.1873 2.57754 13.4412 2.8314 13.5652ZM0.948076 3.75298C0.948076 3.18622 1.41448 2.71981 1.98125 2.71981H10.5418C11.1086 2.71981 11.575 3.18622 11.575 3.75298V9.36163C11.575 9.9284 11.1086 10.3948 10.5418 10.3948H6.28515L3.30961 12.6087V10.3948H1.98125C1.41448 10.3948 0.948076 9.9284 0.948076 9.36163V3.75298Z"
          fill="var(--text-muted)"
        />
      </g>
      <defs>
        <clipPath id="comment-drawer-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

const PortalDrawer = forwardRef(function PortalDrawer({
  task,
  open,
  onClose,
  onTaskUpdated,
  contactName,
  onSessionExpired,
}, ref) {
  const [localTask, setLocalTask] = useState(task);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [commentFocused, setCommentFocused] = useState(false);
  const [doneBtnAnimating, setDoneBtnAnimating] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const statusRef = useRef(null);

  // Sync from parent
  useEffect(() => {
    if (task) {
      setLocalTask(task);
      setComments(task.comments || []);
    }
  }, [task]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCommentInput("");
      setCommentError(null);
      setStatusOpen(false);
      setUploadError(null);
    }
  }, [open]);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    function handleClick(e) {
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusOpen]);

  async function handleApiCall(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) {
      onSessionExpired();
      throw new Error("Session expired");
    }
    return res;
  }

  async function handleMarkDone() {
    if (!localTask) return;
    const isDone = localTask.status === "Done";
    const newStatus = isDone ? (localTask.previousStatus || "Not started") : "Done";
    const body = isDone
      ? { status: newStatus }
      : { status: "Done", previousStatus: localTask.status };

    try {
      const res = await handleApiCall(`/api/portal/tasks/${localTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();

      if (!isDone) {
        setDoneBtnAnimating(true);
        setTimeout(() => setDoneBtnAnimating(false), 800);
      }

      setLocalTask((prev) => ({ ...prev, status: updated.status, previousStatus: updated.previousStatus }));
      onTaskUpdated(localTask.id, updated);
    } catch {
      // silently fail
    }
  }

  async function handleStatusChange(newStatus) {
    if (!localTask) return;
    const body = newStatus === "Done"
      ? { status: "Done", previousStatus: localTask.status }
      : { status: newStatus };

    try {
      const res = await handleApiCall(`/api/portal/tasks/${localTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setLocalTask((prev) => ({ ...prev, status: updated.status, previousStatus: updated.previousStatus }));
      onTaskUpdated(localTask.id, updated);
    } catch {
      // silently fail
    }
    setStatusOpen(false);
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !localTask) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await handleApiCall(`/api/portal/tasks/${localTask.id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const newFile = await res.json();
      setLocalTask((prev) => ({ ...prev, files: [newFile, ...prev.files] }));
      onTaskUpdated(localTask.id, { ...localTask, files: [newFile, ...localTask.files] });
    } catch (err) {
      if (err.message !== "Session expired") setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmitComment() {
    if (!commentInput.trim() || submittingComment || !localTask) return;

    setSubmittingComment(true);
    setCommentError(null);
    try {
      const res = await handleApiCall(`/api/portal/tasks/${localTask.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add comment");
      }
      const newComment = await res.json();
      setComments((prev) => [...prev, newComment]);
      setCommentInput("");
      // Update parent
      onTaskUpdated(localTask.id, {
        ...localTask,
        comments: [...(localTask.comments || []), newComment],
        commentCount: (localTask.commentCount || 0) + 1,
      });
    } catch (err) {
      if (err.message !== "Session expired") setCommentError(err.message);
    } finally {
      setSubmittingComment(false);
    }
  }

  if (!localTask) return null;

  const isDone = localTask.status === "Done";
  const statusColor = STATUS_COLORS[localTask.status] || "var(--text-muted)";
  const hasComment = commentInput.trim().length > 0;

  return (
    <div
      ref={ref}
      className={`task-drawer${open ? " task-drawer--open" : ""}`}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 520,
        background: "var(--bg)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      {/* Sticky header: actions + title */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "var(--bg)",
        }}
      >
        {/* Row: Mark as done + Close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={handleMarkDone}
            className={`flex items-center gap-1 rounded-lg text-sm${isDone ? "" : " btn-secondary"}${doneBtnAnimating ? " done-btn-pop" : ""}`}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: isDone ? "var(--success)" : "var(--text)",
              transition: "color 0.2s ease, border-color 0.2s ease",
              ...(isDone && { border: "1px solid var(--success)" }),
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={isDone && doneBtnAnimating ? "done-check-draw" : ""}
            >
              <path d="M2.5 6.5L5 9L9.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{isDone ? "Done" : "Mark as done"}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-5 h-5 rounded icon-btn"
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Title (read-only) */}
        <h2
          className="text-lg font-semibold"
          style={{
            color: isDone ? "var(--text-muted)" : "var(--text)",
            textDecoration: isDone ? "line-through" : "none",
            lineHeight: 1.3,
          }}
        >
          {localTask.title}
        </h2>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          padding: "20px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
        }}
      >
        {/* Description (read-only) */}
        <p
          className="text-sm"
          style={{
            color: localTask.description ? "var(--text-muted)" : "var(--icon-tertiary)",
            lineHeight: 1.5,
          }}
        >
          {localTask.description || "No description"}
        </p>

        {/* Fields (read-only display) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          {/* Due date */}
          {localTask.due && (
            <FieldRow icon={<CalendarIcon style={{ flexShrink: 0 }} />}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Target</span>
              <span className="text-sm" style={{ color: "var(--text)" }}>
                {new Date(localTask.due + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </FieldRow>
          )}

          {/* Status (editable) */}
          <div ref={statusRef} className="relative">
            <FieldRow
              icon={<StatusIcon style={{ flexShrink: 0 }} />}
              active={statusOpen}
              onClick={() => setStatusOpen(!statusOpen)}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Status</span>
              <span
                className="text-sm rounded"
                style={{
                  color: statusColor,
                  border: `0.5px solid ${statusColor}`,
                  padding: "1px 4px",
                  display: "inline-block",
                  fontSize: 12,
                }}
              >
                {localTask.status}
              </span>
            </FieldRow>
            {statusOpen && (
              <MenuList style={{ minWidth: "100%" }}>
                {TASK_STATUSES.map((s) => (
                  <MenuOption
                    key={s}
                    active={localTask.status === s}
                    onClick={() => handleStatusChange(s)}
                  >
                    <span style={{
                      color: STATUS_COLORS[s],
                      border: `0.5px solid ${STATUS_COLORS[s]}`,
                      padding: "1px 4px",
                      borderRadius: 6,
                      fontSize: 12,
                    }}>
                      {s}
                    </span>
                  </MenuOption>
                ))}
              </MenuList>
            )}
          </div>

          {/* Priority (read-only) */}
          {localTask.priority && (
            <FieldRow icon={<PriorityIcon priority={localTask.priority} style={{ flexShrink: 0 }} />}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Priority</span>
              <span className="text-sm capitalize" style={{ color: "var(--text)" }}>{localTask.priority}</span>
            </FieldRow>
          )}

          {/* Owner (read-only) */}
          {localTask.owner && (
            <FieldRow icon={<OwnerIcon style={{ flexShrink: 0 }} />}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Owner</span>
              <span className="text-sm" style={{ color: "var(--text)" }}>{localTask.owner}</span>
            </FieldRow>
          )}
        </div>

        {/* Files */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 8 }}>
            <FileIcon />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Files</span>
          </div>

          {localTask.files && localTask.files.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {localTask.files.map((f) => (
                <a
                  key={f.id}
                  href={`/api/portal/tasks/${localTask.id}/files/${f.id}`}
                  className="flex items-center gap-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    padding: "8px 12px",
                    textDecoration: "none",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                    <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                  </svg>
                  <span className="flex-1 truncate" style={{ color: "var(--action)" }}>
                    {f.fileName}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {(f.fileSize / 1024).toFixed(0)} KB
                  </span>
                </a>
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
            className="flex items-center gap-1.5 text-sm font-medium rounded-lg"
            style={{
              color: "var(--action)",
              background: "none",
              border: "1px dashed var(--border)",
              cursor: "pointer",
              padding: "8px 12px",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 9V3M3.5 5.5L6 3l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 9.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {uploading ? "Uploading…" : "Upload file"}
          </button>
          {uploadError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>{uploadError}</p>
          )}
        </div>

        {/* Comments */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 8 }}>
            <CommentIcon />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Comments</span>
          </div>

          {comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg text-sm"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    padding: "8px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: c.author === contactName ? "var(--action)" : "var(--text)" }}>
                      {c.author}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {formatTimestamp(c.createdAt)}
                    </span>
                  </div>
                  <p style={{ color: "var(--text)", wordBreak: "break-word" }}>{c.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div
            className="rounded-lg"
            style={{
              background: "var(--bg)",
              border: `1px solid ${commentFocused ? "var(--action)" : "var(--border)"}`,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              transition: "border-color 0.15s ease",
            }}
          >
            <textarea
              value={commentInput}
              onChange={(e) => { setCommentInput(e.target.value); setCommentError(null); }}
              onFocus={() => setCommentFocused(true)}
              onBlur={() => setCommentFocused(false)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitComment(); }}
              placeholder="Add a comment"
              rows={2}
              className="w-full text-sm resize-none outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
            {commentError && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>{commentError}</p>
            )}
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitComment}
                disabled={!hasComment || submittingComment}
              >
                {submittingComment ? "Posting…" : "Comment"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PortalDrawer;
