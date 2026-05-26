"use client";

import { useEffect, useState } from "react";

function ChevronIcon({ open }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function eventPhrase(e) {
  const md = e.metadata || {};
  // `md.taskId` is the human-readable "AC-12" string (only present on
  // entries written post Phase 4c — older rows fall back to title-only).
  // Note: for "uploaded" entries, md.taskId is the NUMERIC task row id
  // (legacy field) — skip prefixing there.
  const code = e.entityType === "task" && typeof md.taskId === "string" ? md.taskId : null;
  const codePrefix = code ? `${code} ` : "";
  switch (e.verb) {
    case "created": return `created ${codePrefix}"${md.title ?? "a task"}"`;
    case "completed": return `completed ${codePrefix}"${md.title ?? "a task"}"`;
    case "status_changed": return `moved ${codePrefix}"${md.title ?? "a task"}" → ${md.to ?? "—"}`;
    case "commented": return `commented on ${codePrefix}"${md.taskTitle ?? "a task"}"`;
    case "uploaded": return `uploaded ${md.fileName ?? "a file"}${md.taskTitle ? ` to "${md.taskTitle}"` : ""}`;
    case "assigned": return `assigned ${codePrefix}"${md.title ?? "a task"}" to ${md.assigneeName ?? "someone"}`;
    default: return e.verb;
  }
}

export default function PortalUpdatesBanner() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/activity", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setData(json);
      })
      .catch((err) => console.error("[PortalUpdatesBanner]", err));
    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    setHidden(true);
    fetch("/api/portal/activity/seen", { method: "POST" }).catch(() => {});
  }

  if (hidden || !data || data.count === 0) return null;

  return (
    <div
      className="rounded-lg"
      style={{
        padding: "10px 12px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left"
          style={{ color: "var(--text)" }}
          aria-expanded={expanded}
        >
          <span
            aria-hidden
            className="shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold"
            style={{
              width: 18,
              height: 18,
              background: "var(--action)",
              color: "var(--text-dark)",
            }}
          >
            {data.count > 9 ? "9+" : data.count}
          </span>
          <span className="text-sm">
            {data.count === 1 ? "1 update" : `${data.count} updates`} since you were last here
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            <ChevronIcon open={expanded} />
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 flex items-center justify-center rounded transition-colors"
          style={{
            width: 24,
            height: 24,
            color: "var(--text-muted)",
          }}
          aria-label="Dismiss"
        >
          <CloseIcon />
        </button>
      </div>

      {expanded && (
        <ul className="flex flex-col" style={{ marginTop: 8, gap: 4 }} role="list">
          {data.events.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-2 text-xs"
              style={{
                paddingLeft: 26,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}
            >
              <span className="flex-1">
                <span className="font-medium" style={{ color: "var(--text)" }}>
                  {e.actorName}
                </span>{" "}
                {eventPhrase(e)}
              </span>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                {timeAgo(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
