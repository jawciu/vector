"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/app/ui/Button";
import FieldPill from "@/app/ui/FieldPill";
import FieldRow from "@/app/ui/FieldRow";
import CalendarDropdown from "@/app/ui/CalendarDropdown";
import {
  CalendarIcon,
  PriorityIcon,
  StatusIcon,
  OwnerIcon,
  MembersIcon,
  DependenciesIcon,
} from "@/app/ui/Icons";
import { MenuList, MenuOption } from "./Menu";

const TASK_STATUSES = ["Not started", "In progress", "Under investigation", "Blocked", "Done"];
const PRIORITIES = ["low", "medium", "high"];

const STATUS_COLORS = {
  "Not started": "var(--text-muted)",
  "In progress": "var(--mint)",
  "Under investigation": "var(--sky)",
  "Blocked": "var(--danger)",
  "Done": "var(--success)",
};

const AVATAR_COLORS = [
  "var(--sunset)", "var(--lilac)", "var(--sky)", "var(--candy)",
  "var(--mint)", "var(--rose)", "var(--alert)", "var(--success)",
];

const AVATAR_IMAGES = {
  "Lena Marsh":  "/avatar-lena.png",
  "Jordan Cole": "/avatar-jordan.png",
  "Priya Nair":  "/avatar-priya.png",
  "Tom Okafor":  "/avatar-tom.png",
  "Dana Fox":    "/avatar-dana.png",
};

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const n = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function avatarInitials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 18 }) {
  if (AVATAR_IMAGES[name]) {
    return (
      <img
        src={AVATAR_IMAGES[name]}
        alt={name}
        title={name}
        className="rounded-full flex-shrink-0"
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center text-[9px] font-semibold rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: avatarColor(name),
        color: "var(--text-dark)",
      }}
      title={name}
    >
      {avatarInitials(name)}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: "currentColor" }}>
      <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <g clipPath="url(#notes-drawer-clip)">
        <path
          d="M3.45675 3.89835H8.94754M3.45675 7.26357H10.6029M3.45675 10.494H7.72288M11.8948 2.83855L9.9266 0.85352C9.8046 0.731724 9.6598 0.635161 9.50047 0.56935C9.34114 0.503539 9.1704 0.46977 8.99801 0.469972H2.43732C2.26179 0.474361 2.09493 0.547188 1.97235 0.672907C1.84978 0.798626 1.7812 0.967278 1.78125 1.14286V12.9521C1.7812 13.1277 1.84978 13.2963 1.97235 13.4221C2.09493 13.5478 2.26179 13.6206 2.43732 13.625H11.6223C11.8007 13.625 11.9719 13.5541 12.0981 13.4279C12.2243 13.3017 12.2952 13.1306 12.2952 12.9521V3.76714C12.2932 3.59357 12.2568 3.42212 12.188 3.26273C12.1193 3.10333 12.0196 2.95915 11.8948 2.83855Z"
          stroke="var(--text-muted)"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="notes-drawer-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
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

function PillClearButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center flex-shrink-0"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-muted)" }}>
        <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
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

// --- Notes formatting toolbar helpers ---

function applyFormat(format, notesValue, setNotesValue, notesRef) {
  const textarea = notesRef.current;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = notesValue.slice(start, end);

  let before = "";
  let after = "";
  let placeholder = "";
  let newVal = notesValue;
  let newCursor = start;

  switch (format) {
    case "bold":
      before = "**"; after = "**"; placeholder = "bold"; break;
    case "italic":
      before = "_"; after = "_"; placeholder = "italic"; break;
    case "underline":
      before = "<u>"; after = "</u>"; placeholder = "text"; break;
    case "strikethrough":
      before = "~~"; after = "~~"; placeholder = "text"; break;
    case "link": {
      const linkText = selected || "text";
      const insertion = `[${linkText}](url)`;
      newVal = notesValue.slice(0, start) + insertion + notesValue.slice(end);
      setNotesValue(newVal);
      setTimeout(() => {
        textarea.focus();
        // Select "url" so the user can immediately type/paste the URL
        const urlStart = start + 1 + linkText.length + 2;
        textarea.setSelectionRange(urlStart, urlStart + 3);
      }, 0);
      return;
    }
    case "code":
      before = "`"; after = "`"; placeholder = "code"; break;
    case "codeblock": {
      const innerText = selected || "code";
      const insertion = "```\n" + innerText + "\n```";
      newVal = notesValue.slice(0, start) + insertion + notesValue.slice(end);
      setNotesValue(newVal);
      setTimeout(() => {
        textarea.focus();
        // Select the inner placeholder so the user can type immediately
        const innerStart = start + 4; // after "```\n"
        textarea.setSelectionRange(innerStart, innerStart + innerText.length);
      }, 0);
      return;
    }
    case "bullet": {
      // Prepend "- " to the current line
      const lineStart = notesValue.lastIndexOf("\n", start - 1) + 1;
      newVal = notesValue.slice(0, lineStart) + "- " + notesValue.slice(lineStart);
      setNotesValue(newVal);
      setTimeout(() => {
        textarea.focus();
        const offset = start + 2;
        textarea.setSelectionRange(offset, offset);
      }, 0);
      return;
    }
    case "numbered": {
      const lineStart = notesValue.lastIndexOf("\n", start - 1) + 1;
      newVal = notesValue.slice(0, lineStart) + "1. " + notesValue.slice(lineStart);
      setNotesValue(newVal);
      setTimeout(() => {
        textarea.focus();
        const offset = start + 3;
        textarea.setSelectionRange(offset, offset);
      }, 0);
      return;
    }
    case "blockquote": {
      const lineStart = notesValue.lastIndexOf("\n", start - 1) + 1;
      newVal = notesValue.slice(0, lineStart) + "> " + notesValue.slice(lineStart);
      setNotesValue(newVal);
      setTimeout(() => {
        textarea.focus();
        const offset = start + 2;
        textarea.setSelectionRange(offset, offset);
      }, 0);
      return;
    }
    case "newline": {
      newVal = notesValue.slice(0, start) + "\n" + notesValue.slice(end);
      setNotesValue(newVal);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 1, start + 1);
      }, 0);
      return;
    }
    case "sparkle":
      // No-op placeholder
      return;
    default:
      return;
  }

  const text = selected || placeholder;
  newVal = notesValue.slice(0, start) + before + text + after + notesValue.slice(end);
  setNotesValue(newVal);
  setTimeout(() => {
    textarea.focus();
    if (!selected) {
      // Select the placeholder so the user can type over it immediately
      textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length);
    } else {
      const cursor = start + before.length + text.length + after.length;
      textarea.setSelectionRange(cursor, cursor);
    }
  }, 0);
}

function ToolbarSeparator() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        background: "var(--border)",
        margin: "0 2px",
        flexShrink: 0,
        alignSelf: "center",
      }}
    />
  );
}

function ToolbarButton({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="toolbar-btn flex items-center justify-center rounded text-xs"
      style={{
        width: 24,
        height: 24,
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function NotesToolbar({ notesValue, setNotesValue, notesRef }) {
  const fmt = (format) => applyFormat(format, notesValue, setNotesValue, notesRef);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        padding: "4px 8px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        borderRadius: "8px 8px 0 0",
        flexWrap: "nowrap",
      }}
    >
      {/* + new line */}
      <ToolbarButton title="New line" onClick={() => fmt("newline")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Bold */}
      <ToolbarButton title="Bold (**text**)" onClick={() => fmt("bold")}>
        <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1 }}>B</span>
      </ToolbarButton>

      {/* Italic */}
      <ToolbarButton title="Italic (_text_)" onClick={() => fmt("italic")}>
        <span style={{ fontStyle: "italic", fontSize: 13, lineHeight: 1 }}>I</span>
      </ToolbarButton>

      {/* Underline */}
      <ToolbarButton title="Underline (<u>text</u>)" onClick={() => fmt("underline")}>
        <span style={{ textDecoration: "underline", fontSize: 13, lineHeight: 1 }}>U</span>
      </ToolbarButton>

      {/* Strikethrough */}
      <ToolbarButton title="Strikethrough (~~text~~)" onClick={() => fmt("strikethrough")}>
        <span style={{ textDecoration: "line-through", fontSize: 13, lineHeight: 1 }}>S</span>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Bullet list */}
      <ToolbarButton title="Bullet list (- item)" onClick={() => fmt("bullet")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="1.5" cy="3" r="1" fill="currentColor" />
          <circle cx="1.5" cy="6" r="1" fill="currentColor" />
          <circle cx="1.5" cy="9" r="1" fill="currentColor" />
          <line x1="4" y1="3" x2="11" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </ToolbarButton>

      {/* Numbered list */}
      <ToolbarButton title="Numbered list (1. item)" onClick={() => fmt("numbered")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          {/* 1 */}
          <path d="M1.5 2.5V5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
          {/* 2 */}
          <path d="M1 7.5c0-.6.9-1 .9-.3s-1 1.3-1 1.8h1.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
          {/* 3 — just a dot for simplicity */}
          <circle cx="1.5" cy="10" r="0.6" fill="currentColor" />
          <line x1="4" y1="3" x2="11" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </ToolbarButton>

      {/* Blockquote */}
      <ToolbarButton title="Blockquote (> text)" onClick={() => fmt("blockquote")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="1.5" y1="2" x2="1.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="10" x2="9" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Link */}
      <ToolbarButton title="Link ([text](url))" onClick={() => fmt("link")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M5 7.5a3 3 0 0 0 4.243 0l1.5-1.5a3 3 0 0 0-4.243-4.243L5.75 2.5"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
          />
          <path
            d="M7 4.5a3 3 0 0 0-4.243 0l-1.5 1.5a3 3 0 0 0 4.243 4.243L6.25 9.5"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </ToolbarButton>

      {/* Inline code */}
      <ToolbarButton title="Inline code (`code`)" onClick={() => fmt("code")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 3L1 6l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>

      {/* Code block */}
      <ToolbarButton title="Code block (```code```)" onClick={() => fmt("codeblock")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="0.5" y="0.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1" />
          <path d="M3 4.5L1.5 6l1.5 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 8.5l1-5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <path d="M9 4.5L10.5 6 9 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Sparkle / AI placeholder */}
      <ToolbarButton title="AI assist (coming soon)" onClick={() => fmt("sparkle")}>
        <span style={{ fontSize: 12, lineHeight: 1 }}>✦</span>
      </ToolbarButton>
    </div>
  );
}

export default function TaskDrawer({
  task,
  open,
  onClose,
  onTaskUpdated,
  people = [],
  allTasks = [],
}) {
  const [localTask, setLocalTask] = useState(task);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [notesFocused, setNotesFocused] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);

  // Hover states for field rows (show X on hover)
  const [dueDateHovered, setDueDateHovered] = useState(false);
  const [statusHovered, setStatusHovered] = useState(false);
  const [priorityHovered, setPriorityHovered] = useState(false);
  const [ownerHovered, setOwnerHovered] = useState(false);
  const [membersHovered, setMembersHovered] = useState(false);
  const [depsHovered, setDepsHovered] = useState(false);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [notesValue, setNotesValue] = useState("");

  // Dropdown states
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const calendarRef = useRef(null);
  const statusRef = useRef(null);
  const priorityRef = useRef(null);
  const ownerRef = useRef(null);
  const membersRef = useRef(null);
  const depsRef = useRef(null);
  const notesRef = useRef(null);

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setLocalTask(task);
      setTitleValue(task.title || "");
      setDescValue(task.description || "");
      setNotesValue(task.notes || "");
      closeAllDropdowns();
      setEditingTitle(false);
      setEditingDesc(false);
    }
  }, [task?.id]);

  // Load comments when drawer opens
  useEffect(() => {
    if (open && task) {
      fetch(`/api/tasks/${task.id}/comments`)
        .then((r) => r.json())
        .then((data) => setComments(Array.isArray(data) ? data : []))
        .catch(() => setComments([]));
    }
  }, [open, task?.id]);

  // Load current user for comment avatar
  useEffect(() => {
    createClient().then((supabase) => {
      if (!supabase) return;
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user) setCurrentUser(data.user);
      });
    });
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (calendarOpen && calendarRef.current && !calendarRef.current.contains(e.target)) setCalendarOpen(false);
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(e.target)) setPriorityOpen(false);
      if (ownerOpen && ownerRef.current && !ownerRef.current.contains(e.target)) setOwnerOpen(false);
      if (membersOpen && membersRef.current && !membersRef.current.contains(e.target)) setMembersOpen(false);
      if (depsOpen && depsRef.current && !depsRef.current.contains(e.target)) setDepsOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, calendarOpen, statusOpen, priorityOpen, ownerOpen, membersOpen, depsOpen]);

  function closeAllDropdowns() {
    setCalendarOpen(false);
    setStatusOpen(false);
    setPriorityOpen(false);
    setOwnerOpen(false);
    setMembersOpen(false);
    setDepsOpen(false);
  }

  function toggleDropdown(current, setter) {
    const wasOpen = current;
    closeAllDropdowns();
    if (!wasOpen) setter(true);
  }

  async function patchTask(patch) {
    const res = await fetch(`/api/tasks/${localTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setLocalTask(updated);
    if (onTaskUpdated) onTaskUpdated(updated);
    return updated;
  }

  async function handleMarkDone() {
    const goingToDone = localTask.status !== "Done";
    const patch = goingToDone
      ? { status: "Done", previousStatus: localTask.status }
      : { status: localTask.previousStatus || "Not started", previousStatus: null };
    await patchTask(patch);
  }

  function handleTitleBlur() {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== localTask.title) {
      patchTask({ title: titleValue.trim() });
    }
  }

  function handleDescBlur() {
    setEditingDesc(false);
    if (descValue !== (localTask.description || "")) {
      patchTask({ description: descValue });
    }
  }

  function handleNotesBlur() {
    if (notesValue !== (localTask.notes || "")) {
      patchTask({ notes: notesValue });
    }
  }

  async function handleSubmitComment() {
    const trimmed = commentInput.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/tasks/${localTask.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setCommentInput("");
        const updated = { ...localTask, commentCount: (localTask.commentCount || 0) + 1 };
        setLocalTask(updated);
        if (onTaskUpdated) onTaskUpdated(updated);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Comment POST failed:", err);
        setCommentError(err.error || "Failed to post comment");
      }
    } catch (e) {
      console.error("Comment POST error:", e);
      setCommentError("Network error. Please try again.");
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
      className={`task-drawer${open ? " task-drawer--open" : ""}`}
      style={{
        position: "fixed",
        top: 44,
        right: 0,
        bottom: 0,
        width: 520,
        background: "var(--bg)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 0",
          flexShrink: 0,
        }}
      >
        {/* Mark as done button */}
        <button
          type="button"
          onClick={handleMarkDone}
          className="flex items-center gap-1.5 rounded-lg text-sm"
          style={{
            border: "1px solid var(--button-secondary-border)",
            padding: "4px 8px",
            background: "none",
            cursor: "pointer",
            color: isDone ? "var(--success)" : "var(--text-muted)",
            transition: "color 0.15s ease, border-color 0.15s ease",
          }}
        >
          {isDone ? (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
                fill="var(--success)"
              />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
              <path d="M3.5 7L6.5 9.5L10.5 4.5" stroke="currentColor" strokeLinecap="round" />
            </svg>
          )}
          <span>{isDone ? "Done" : "Mark as done"}</span>
        </button>

        {/* Close button */}
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
        {/* Title */}
        {editingTitle ? (
          <input
            autoFocus
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === "Enter") handleTitleBlur(); if (e.key === "Escape") { setTitleValue(localTask.title); setEditingTitle(false); } }}
            className="w-full outline-none text-lg font-semibold"
            style={{ background: "transparent", border: "none", color: "var(--text)", padding: 0, lineHeight: 1.3 }}
          />
        ) : (
          <h2
            onClick={() => setEditingTitle(true)}
            className="text-lg font-semibold cursor-text"
            style={{
              color: isDone ? "var(--text-muted)" : "var(--text)",
              textDecoration: isDone ? "line-through" : "none",
              lineHeight: 1.3,
            }}
          >
            {localTask.title}
          </h2>
        )}

        {/* Description */}
        {editingDesc ? (
          <textarea
            autoFocus
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={handleDescBlur}
            onKeyDown={(e) => { if (e.key === "Escape") { setDescValue(localTask.description || ""); setEditingDesc(false); } }}
            rows={3}
            className="w-full outline-none text-sm resize-none"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text)",
              padding: 0,
              lineHeight: 1.5,
              marginTop: -8,
            }}
          />
        ) : (
          <p
            onClick={() => setEditingDesc(true)}
            className="text-sm cursor-text"
            style={{
              color: localTask.description ? "var(--text-muted)" : "var(--icon-tertiary)",
              lineHeight: 1.5,
              marginTop: -8,
            }}
          >
            {localTask.description || "Add a description…"}
          </p>
        )}

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>

          {/* Due date */}
          <div ref={calendarRef} className="relative" onMouseEnter={() => setDueDateHovered(true)} onMouseLeave={() => setDueDateHovered(false)}>
            <FieldRow
              icon={<CalendarIcon style={{ flexShrink: 0 }} />}
              active={calendarOpen}
              onClick={() => toggleDropdown(calendarOpen, setCalendarOpen)}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Target</span>
              {localTask.due && (
                <span className="text-sm" style={{ color: "var(--text)" }}>
                  {new Date(localTask.due + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              )}
              {localTask.due && (dueDateHovered || calendarOpen) && (
                <PillClearButton onClick={(e) => { e.stopPropagation(); patchTask({ due: "" }); setCalendarOpen(false); }} />
              )}
            </FieldRow>
            {calendarOpen && (
              <CalendarDropdown
                value={localTask.due}
                viewDate={viewDate}
                onViewDateChange={setViewDate}
                onChange={(date) => { patchTask({ due: date }); setCalendarOpen(false); }}
                onClear={() => { patchTask({ due: "" }); setCalendarOpen(false); }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>

          {/* Status */}
          <div ref={statusRef} className="relative" onMouseEnter={() => setStatusHovered(true)} onMouseLeave={() => setStatusHovered(false)}>
            <FieldRow
              icon={<StatusIcon style={{ flexShrink: 0 }} />}
              active={statusOpen}
              onClick={() => toggleDropdown(statusOpen, setStatusOpen)}
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
              {(statusHovered || statusOpen) && (
                <PillClearButton onClick={(e) => { e.stopPropagation(); patchTask({ status: "Not started" }); setStatusOpen(false); }} />
              )}
            </FieldRow>
            {statusOpen && (
              <MenuList style={{ minWidth: "100%" }}>
                {TASK_STATUSES.map((s) => (
                  <MenuOption
                    key={s}
                    active={localTask.status === s}
                    onClick={() => { patchTask({ status: s, ...(s === "Done" && { previousStatus: localTask.status }) }); setStatusOpen(false); }}
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

          {/* Priority */}
          <div ref={priorityRef} className="relative" onMouseEnter={() => setPriorityHovered(true)} onMouseLeave={() => setPriorityHovered(false)}>
            <FieldRow
              icon={<PriorityIcon priority={localTask.priority} style={{ flexShrink: 0 }} />}
              active={priorityOpen}
              onClick={() => toggleDropdown(priorityOpen, setPriorityOpen)}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Priority</span>
              {localTask.priority && (
                <span className="text-sm capitalize" style={{ color: "var(--text)" }}>{localTask.priority}</span>
              )}
              {localTask.priority && (priorityHovered || priorityOpen) && (
                <PillClearButton onClick={(e) => { e.stopPropagation(); patchTask({ priority: null }); setPriorityOpen(false); }} />
              )}
            </FieldRow>
            {priorityOpen && (
              <MenuList style={{ minWidth: "100%" }}>
                {PRIORITIES.map((p) => (
                  <MenuOption
                    key={p}
                    active={localTask.priority === p}
                    onClick={() => { patchTask({ priority: localTask.priority === p ? null : p }); setPriorityOpen(false); }}
                    className="capitalize"
                  >
                    <div className="flex items-center gap-2">
                      <PriorityIcon priority={p} />
                      <span>{p}</span>
                    </div>
                  </MenuOption>
                ))}
              </MenuList>
            )}
          </div>

          {/* Owner */}
          <div ref={ownerRef} className="relative" onMouseEnter={() => setOwnerHovered(true)} onMouseLeave={() => setOwnerHovered(false)}>
            <FieldRow
              icon={<OwnerIcon style={{ flexShrink: 0 }} />}
              active={ownerOpen}
              onClick={() => toggleDropdown(ownerOpen, setOwnerOpen)}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Owner</span>
              {localTask.owner && (
                <div className="flex items-center gap-1.5">
                  <Avatar name={localTask.owner} size={16} />
                  <span className="text-sm" style={{ color: "var(--text)" }}>{localTask.owner}</span>
                  {(ownerHovered || ownerOpen) && <PillClearButton onClick={(e) => { e.stopPropagation(); patchTask({ owner: "" }); setOwnerOpen(false); }} />}
                </div>
              )}
            </FieldRow>
            {ownerOpen && (
              <MenuList style={{ minWidth: "100%", maxHeight: 160, overflowY: "auto" }}>
                {people.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No people available</div>
                ) : (
                  people.map((person) => (
                    <MenuOption
                      key={person}
                      active={localTask.owner === person}
                      onClick={() => { patchTask({ owner: localTask.owner === person ? "" : person }); setOwnerOpen(false); }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Avatar name={person} size={16} />
                        <span>{person}</span>
                      </div>
                    </MenuOption>
                  ))
                )}
              </MenuList>
            )}
          </div>

          {/* Members */}
          <div ref={membersRef} className="relative" onMouseEnter={() => setMembersHovered(true)} onMouseLeave={() => setMembersHovered(false)}>
            <FieldRow
              icon={<MembersIcon style={{ flexShrink: 0 }} />}
              active={membersOpen}
              onClick={() => toggleDropdown(membersOpen, setMembersOpen)}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Members</span>
              {localTask.members && localTask.members.length > 0 && (
                <>
                  {/* Avatar stack — negative margins for overlap */}
                  <div className="flex items-center">
                    {localTask.members.slice(0, 5).map((m, i) => (
                      <div key={m} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 5 - i, position: "relative" }}>
                        <Avatar name={m} size={16} />
                      </div>
                    ))}
                    {localTask.members.length > 5 && (
                      <div
                        className="flex items-center justify-center text-[8px] font-semibold rounded-full"
                        style={{ width: 16, height: 16, background: "var(--surface-hover)", color: "var(--text-muted)", marginLeft: -6 }}
                      >
                        +{localTask.members.length - 5}
                      </div>
                    )}
                  </div>
                  {/* X sits outside the avatar stack so it's never hidden */}
                  {(membersHovered || membersOpen) && (
                    <PillClearButton onClick={(e) => { e.stopPropagation(); patchTask({ members: [] }); setMembersOpen(false); }} />
                  )}
                </>
              )}
            </FieldRow>
            {membersOpen && (
              <MenuList style={{ minWidth: "100%", maxHeight: 180, overflowY: "auto" }}>
                {people.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No people available</div>
                ) : (
                  people.map((person) => {
                    const isMember = (localTask.members || []).includes(person);
                    return (
                      <MenuOption
                        key={person}
                        active={isMember}
                        onClick={() => {
                          const current = localTask.members || [];
                          const updated = isMember ? current.filter((m) => m !== person) : [...current, person];
                          patchTask({ members: updated });
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Avatar name={person} size={16} />
                          <span>{person}</span>
                          {isMember && <span className="ml-auto text-xs" style={{ color: "var(--success)" }}>✓</span>}
                        </div>
                      </MenuOption>
                    );
                  })
                )}
              </MenuList>
            )}
          </div>

          {/* Dependencies */}
          <div ref={depsRef} className="relative" onMouseEnter={() => setDepsHovered(true)} onMouseLeave={() => setDepsHovered(false)}>
            <FieldRow
              icon={<DependenciesIcon style={{ flexShrink: 0 }} />}
              active={depsOpen}
              onClick={() => toggleDropdown(depsOpen, setDepsOpen)}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Dependencies</span>
              {localTask.blockedByTaskId && (
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {allTasks.find((t) => t.id === localTask.blockedByTaskId)?.title || "Task"}
                  </span>
                  {(depsHovered || depsOpen) && <PillClearButton onClick={(e) => { e.stopPropagation(); patchTask({ blockedByTaskId: null }); setDepsOpen(false); }} />}
                </div>
              )}
            </FieldRow>
            {depsOpen && (
              <MenuList style={{ width: "max-content", minWidth: "100%", maxWidth: 360, maxHeight: 160, overflowY: "auto" }}>
                {allTasks.filter((t) => t.id !== localTask.id).length === 0 ? (
                  <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No other tasks</div>
                ) : (
                  allTasks
                    .filter((t) => t.id !== localTask.id)
                    .map((t) => (
                      <MenuOption
                        key={t.id}
                        active={localTask.blockedByTaskId === t.id}
                        onClick={() => {
                          patchTask({ blockedByTaskId: localTask.blockedByTaskId === t.id ? null : t.id });
                          setDepsOpen(false);
                        }}
                      >
                        <span>{t.title}</span>
                      </MenuOption>
                    ))
                )}
              </MenuList>
            )}
          </div>
        </div>

        {/* Notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 8 }}>
            <NotesIcon />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Notes</span>
          </div>
          {/* Toolbar + textarea grouped with shared border */}
          <div
            style={{
              border: `1px solid ${notesFocused ? "var(--action)" : "var(--border)"}`,
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--bg)",
              transition: "border-color 0.15s ease",
            }}
          >
            <NotesToolbar
              notesValue={notesValue}
              setNotesValue={setNotesValue}
              notesRef={notesRef}
            />
            <textarea
              ref={notesRef}
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onFocus={() => setNotesFocused(true)}
              onBlur={() => { setNotesFocused(false); handleNotesBlur(); }}
              placeholder="Write your notes here"
              rows={5}
              className="w-full text-sm resize-y outline-none"
              style={{
                background: "var(--bg)",
                border: "none",
                borderRadius: 0,
                color: "var(--text)",
                padding: "8px 12px",
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Comments */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 8 }}>
            <CommentIcon />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Comments</span>
          </div>

          {/* Existing comments */}
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
                    <Avatar name={c.author} size={16} />
                    <span style={{ color: "var(--text)" }}>{c.author}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatTimestamp(c.createdAt)}</span>
                  </div>
                  <p style={{ color: "var(--text)", paddingLeft: 24, wordBreak: "break-word" }}>{c.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add comment — avatar + textarea side by side */}
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
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Avatar
                name={currentUser?.user_metadata?.full_name || currentUser?.email || "You"}
                size={18}
              />
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
                  flex: 1,
                  minWidth: 0,
                }}
              />
            </div>
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
}
