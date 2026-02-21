"use client";

import { useState } from "react";

const AVATAR_COLORS = [
  "var(--sunset)",
  "var(--lilac)",
  "var(--sky)",
  "var(--candy)",
  "var(--mint)",
  "var(--rose)",
  "var(--alert)",
  "var(--success)",
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const n = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDueDate(dateStr) {
  const due = parseLocalDate(dateStr);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (due.getTime() === today.getTime()) return { text: "today", color: "var(--action)" };
  if (due.getTime() === yesterday.getTime()) return { text: "yesterday", color: "var(--danger)" };
  return {
    text: due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    color: "var(--text-muted)",
  };
}

function getDaysLeft(dateStr) {
  const due = parseLocalDate(dateStr);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_STYLES = {
  "Not started": "var(--text-muted)",
  "In progress": "var(--mint)",
  "Under investigation": "var(--sky)",
  "Blocked": "var(--danger)",
  "Done": "var(--success)",
};

function PriorityIcon({ priority }) {
  if (!priority) return null;
  const active = "var(--action)";
  const inactive = "var(--icon-tertiary)";
  const colorMap = {
    low: [active, inactive, inactive],
    medium: [active, active, inactive],
    high: [active, active, active],
  };
  const colors = colorMap[priority.toLowerCase()] || null;
  if (!colors) return null;
  // colors[0]=bottom chevron, colors[1]=middle, colors[2]=top
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M2.0835 17.5001L10.0002 11.6667L17.9168 17.5001" stroke={colors[0]} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.0835 12.5001L10.0002 6.66675L17.9168 12.5001" stroke={colors[1]} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.0835 7.50008L10.0002 1.66675L17.9168 7.50008" stroke={colors[2]} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckboxButton({ isDone, isCompleting, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex-shrink-0${isCompleting ? " checkbox-bounce" : ""}`}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 2, display: "flex" }}
      aria-label={isDone ? "Mark as incomplete" : "Mark as done"}
    >
      {isDone ? (
        /* Checked: filled circle with embedded checkmark (exact Figma path) */
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
            fill="var(--success)"
          />
        </svg>
      ) : (
        /* Default / hover: circle stroke + checkmark stroke */
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle
            cx="7" cy="7" r="6.5"
            stroke={hovered ? "var(--success)" : "var(--icon-tertiary)"}
            style={{ transition: "stroke 0.15s ease" }}
          />
          <path
            d="M3.5 7L6.5 9.5L10.5 4.5"
            stroke={hovered ? "var(--success)" : "var(--icon-tertiary)"}
            strokeLinecap="round"
            style={{ transition: "stroke 0.15s ease" }}
          />
        </svg>
      )}
    </button>
  );
}

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted }) {
  const [completing, setCompleting] = useState(false);

  const isDone = task.status === "Done" || completing;
  const statusColor = STATUS_STYLES[task.status] || "var(--text-muted)";
  const dueInfo = task.due ? formatDueDate(task.due) : null;
  const daysLeft = task.due ? getDaysLeft(task.due) : null;
  const ownerInitials = task.owner
    ? task.owner.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : null;

  async function handleToggleDone(e) {
    e.stopPropagation();
    if (completing) return;

    const goingToDone = task.status !== "Done";
    if (goingToDone) setCompleting(true);

    const patch = task.status === "Done"
      ? { status: task.previousStatus || "Not started", previousStatus: null }
      : { status: "Done", previousStatus: task.status };

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) throw new Error("Failed");

      const updatedTask = await response.json();

      if (goingToDone) {
        setTimeout(() => {
          if (onTaskUpdated) onTaskUpdated(updatedTask);
          setCompleting(false);
        }, 800);
      } else {
        if (onTaskUpdated) onTaskUpdated(updatedTask);
        setCompleting(false);
      }
    } catch {
      setCompleting(false);
    }
  }

  return (
    <div
      className={`rounded-lg${completing ? " task-completing" : ""}`}
      style={{
        background: "var(--bg-elevated)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Row 1: Checkbox + Title */}
      <div className="flex items-start gap-2.5">
        <CheckboxButton
          isDone={isDone}
          isCompleting={completing}
          onClick={handleToggleDone}
        />

        <span
          className="text-sm flex-1 leading-snug"
          style={{
            color: isDone ? "var(--text-muted)" : "var(--text)",
            textDecoration: isDone ? "line-through" : "none",
            transition: "color 0.25s ease",
          }}
        >
          {task.title}
        </span>
      </div>

      {/* Row 2: Due date + days remaining (hidden if no due date) */}
      {task.due && dueInfo && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Calendar icon */}
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
              <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <line x1="4" y1="0.5" x2="4" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="10" y1="0.5" x2="10" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="text-sm" style={{ color: dueInfo.color }}>
              {dueInfo.text}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Clock icon */}
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 4V7.5L9.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span
              className="text-sm"
              style={{ color: daysLeft !== null && daysLeft < 0 ? "var(--danger)" : "var(--text-muted)" }}
            >
              {daysLeft !== null ? `${daysLeft}d` : ""}
            </span>
          </div>
        </div>
      )}

      {/* Row 3: Status badge */}
      <div>
        <span
          className="text-sm rounded-md"
          style={{
            color: statusColor,
            border: `0.5px solid ${statusColor}`,
            padding: "2px 4px",
          }}
        >
          {task.status}
        </span>
      </div>

      {/* Row 4: Waiting on (hidden if empty) */}
      {task.waitingOn && task.waitingOn.trim() && (
        <div className="flex items-center gap-1.5">
          {/* People icon */}
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
            <circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1 12c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="10.5" cy="4.5" r="1.7" stroke="currentColor" strokeWidth="1.1" />
            <path d="M12.5 12c0-1.8-0.8-3-2-3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {task.waitingOn}
          </span>
        </div>
      )}

      {/* Row 5: Notes + comments + priority + owner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Notes indicator */}
          {task.notes && task.notes.trim() && (
            <div className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="3.5" y1="4.5" x2="10.5" y2="4.5" stroke="currentColor" strokeWidth="1" />
                <line x1="3.5" y1="7" x2="10.5" y2="7" stroke="currentColor" strokeWidth="1" />
                <line x1="3.5" y1="9.5" x2="7.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
          )}
          {/* Comment count */}
          {task.commentCount > 0 && (
            <div className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                <path d="M2 2h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5l-3 2.5V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {task.commentCount}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={task.priority} />
          {ownerInitials && (
            <div
              className="flex items-center justify-center text-[9px] font-semibold rounded-full flex-shrink-0"
              style={{
                width: 18,
                height: 18,
                background: avatarColor(task.owner),
                color: "var(--text-dark)",
              }}
            >
              {ownerInitials}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
