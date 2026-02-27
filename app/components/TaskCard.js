"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon, PriorityIcon, DependenciesIcon } from "../ui/Icons";

const AVATAR_COLORS = [
  "var(--sunset)",
  "var(--lilac)",
  "var(--sky)",
  "var(--candy)",
  "var(--mint)",
  "var(--rose)",
];

const AVATAR_IMAGES = {
  "Lena Marsh":   "/avatar-lena.png",
  "Jordan Cole":  "/avatar-jordan.png",
  "Priya Nair":   "/avatar-priya.png",
  "Tom Okafor":   "/avatar-tom.png",
  "Dana Fox":     "/avatar-dana.png",
};

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
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due.getTime() === today.getTime()) return { text: "today", color: "var(--sunset)" };
  if (due.getTime() === tomorrow.getTime()) return { text: "tomorrow", color: "var(--alert)" };
  if (due.getTime() === yesterday.getTime()) return { text: "yesterday", color: "var(--danger)" };
  return {
    text: due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    color: "var(--text-secondary)",
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
  "Not started": "var(--text-secondary)",
  "In progress": "var(--mint)",
  "Under investigation": "var(--sky)",
  "Blocked": "var(--danger)",
  "Done": "var(--success)",
};


function CheckboxButton({ isDone, isCompleting, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex-shrink-0${isCompleting ? " checkbox-bounce" : ""}`}
      style={{ background: "none", border: "none", padding: "4px", margin: "-4px", marginTop: -2, cursor: "pointer", display: "flex" }}
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

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted, onCardClick, isOverlay }) {
  const [completing, setCompleting] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: isOverlay });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isDone = task.status === "Done" || completing;
  const statusColor = STATUS_STYLES[task.status] || "var(--text-secondary)";
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
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-task-card
      onClick={() => { if (onCardClick) onCardClick(task); }}
      className={`rounded-lg${completing ? " task-completing" : ""}`}
      style={{
        background: "var(--bg-elevated)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...style,
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
            color: isDone ? "var(--text-secondary)" : "var(--text)",
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
            <CalendarIcon style={{ flexShrink: 0 }} />
            <span className="text-sm" style={{ color: dueInfo.color }}>
              {dueInfo.text}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Clock icon */}
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, color: "var(--text-secondary)" }}>
              <path d="M7.00712 13.1381C3.62623 13.1381 0.875977 10.3879 0.875977 7.007C0.875977 3.62611 3.62623 0.875854 7.00712 0.875854C10.388 0.875854 13.1383 3.62611 13.1383 7.007C13.1383 10.3879 10.388 13.1381 7.00712 13.1381ZM7.00712 1.75173C4.10796 1.75173 1.75185 4.10784 1.75185 7.007C1.75185 9.90615 4.10796 12.2623 7.00712 12.2623C9.90627 12.2623 12.2624 9.90615 12.2624 7.007C12.2624 4.10784 9.90627 1.75173 7.00712 1.75173Z" fill="currentColor" />
              <path d="M8.75948 9.19674C8.68065 9.19674 8.60182 9.17923 8.53175 9.13543L6.34205 7.82162C6.27749 7.78231 6.2242 7.72697 6.18737 7.66097C6.15053 7.59498 6.1314 7.52057 6.13184 7.44499V3.94148C6.13184 3.69623 6.32454 3.50354 6.56978 3.50354C6.81503 3.50354 7.00772 3.69623 7.00772 3.94148V7.19974L8.9872 8.38218C9.06874 8.43215 9.13176 8.50734 9.16671 8.59635C9.20166 8.68536 9.20664 8.78334 9.18089 8.87544C9.15514 8.96754 9.10007 9.04873 9.02403 9.10671C8.94798 9.16469 8.8551 9.1963 8.75948 9.19674Z" fill="currentColor" />
            </svg>
            <span
              className="text-sm"
              style={{ color: daysLeft === 0 ? "var(--sunset)" : daysLeft === 1 ? "var(--alert)" : daysLeft !== null && daysLeft < 0 ? "var(--danger)" : "var(--text-secondary)" }}
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

      {/* Row 4: Blocked by */}
      {task.blockedByTask && (
        <div className="flex items-center gap-1.5">
          <DependenciesIcon style={{ flexShrink: 0 }} />
          <span className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
            {task.blockedByTask.title}
          </span>
        </div>
      )}

      {/* Row 5: Notes + comments + priority + owner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Notes indicator */}
          {task.notes && task.notes.trim() && (
            <div className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-secondary)" }}>
                <g clipPath="url(#notes-clip)">
                  <path d="M3.45675 3.89835H8.94754M3.45675 7.26357H10.6029M3.45675 10.494H7.72288M11.8948 2.83855L9.9266 0.85352C9.8046 0.731724 9.6598 0.635161 9.50047 0.56935C9.34114 0.503539 9.1704 0.46977 8.99801 0.469972H2.43732C2.26179 0.474361 2.09493 0.547188 1.97235 0.672907C1.84978 0.798626 1.7812 0.967278 1.78125 1.14286V12.9521C1.7812 13.1277 1.84978 13.2963 1.97235 13.4221C2.09493 13.5478 2.26179 13.6206 2.43732 13.625H11.6223C11.8007 13.625 11.9719 13.5541 12.0981 13.4279C12.2243 13.3017 12.2952 13.1306 12.2952 12.9521V3.76714C12.2932 3.59357 12.2568 3.42212 12.188 3.26273C12.1193 3.10333 12.0196 2.95915 11.8948 2.83855Z" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                <defs>
                  <clipPath id="notes-clip">
                    <rect width="14" height="14" fill="white" />
                  </clipPath>
                </defs>
              </svg>
            </div>
          )}
          {/* Comment count */}
          {task.commentCount > 0 && (
            <div className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-secondary)" }}>
                <g clipPath="url(#comment-clip)">
                  <path d="M1.83778 1.24799C1.88502 1.24523 1.93284 1.24385 1.98125 1.24385H10.5418C11.2073 1.24385 11.8455 1.50821 12.316 1.97876C12.7866 2.44931 13.0509 3.08752 13.0509 3.75298V9.36163C13.0509 9.41004 13.0496 9.45806 13.0468 9.50569C13.3195 9.3324 13.544 9.09307 13.6996 8.80986C13.8551 8.52666 13.9366 8.20877 13.9365 7.88567V3.75298C13.9365 3.30718 13.8487 2.86575 13.6781 2.45389C13.5075 2.04202 13.2575 1.66779 12.9422 1.35256C12.627 1.03734 12.2528 0.787283 11.8409 0.616683C11.429 0.446083 10.9876 0.358276 10.5418 0.358276H3.45721C3.13421 0.358284 2.81644 0.439831 2.53335 0.59536C2.25026 0.750889 2.01101 0.975366 1.83778 1.24799ZM2.8314 13.5652C2.93767 13.6183 3.04984 13.6419 3.16202 13.6419H3.16792C3.32142 13.6419 3.47492 13.5947 3.6048 13.4943L6.58034 11.2804H10.5418C11.5986 11.2804 12.4606 10.4184 12.4606 9.36163V3.75298C12.4606 2.6962 11.5986 1.83424 10.5418 1.83424H1.98125C0.924461 1.83424 0.0625 2.6962 0.0625 3.75298V9.36163C0.0625 10.4184 0.924461 11.2804 1.98125 11.2804H2.42404V12.9039C2.42404 13.1873 2.57754 13.4412 2.8314 13.5652ZM0.948076 3.75298C0.948076 3.18622 1.41448 2.71981 1.98125 2.71981H10.5418C11.1086 2.71981 11.575 3.18622 11.575 3.75298V9.36163C11.575 9.9284 11.1086 10.3948 10.5418 10.3948H6.28515L3.30961 12.6087V10.3948H1.98125C1.41448 10.3948 0.948076 9.9284 0.948076 9.36163V3.75298Z" fill="currentColor" />
                </g>
                <defs>
                  <clipPath id="comment-clip">
                    <rect width="14" height="14" fill="white" />
                  </clipPath>
                </defs>
              </svg>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {task.commentCount}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={task.priority} size={18} />
          {ownerInitials && (
            AVATAR_IMAGES[task.owner] ? (
              <img
                src={AVATAR_IMAGES[task.owner]}
                alt={task.owner}
                title={task.owner}
                className="rounded-full flex-shrink-0"
                style={{ width: 20, height: 20, objectFit: "cover" }}
              />
            ) : (
              <div
                className="flex items-center justify-center text-[9px] font-semibold rounded-full flex-shrink-0"
                style={{
                  width: 20,
                  height: 20,
                  background: avatarColor(task.owner),
                  color: "var(--text-dark)",
                }}
                title={task.owner}
              >
                {ownerInitials}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
