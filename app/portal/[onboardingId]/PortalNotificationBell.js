"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { avatarColor, avatarInitials } from "@/lib/avatar";

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
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

/**
 * Customer-portal notification centre. Same bell + badge + popover as the
 * vendor `NotificationBell`, but fed by `/api/portal/activity` (vendor
 * activity since this contact's `lastSeenPortalAt`) rather than the
 * vendor-scoped `/api/notifications`.
 *
 * Opening the popover marks the activity seen, so the badge clears while the
 * list stays visible for the rest of the session.
 */
export default function PortalNotificationBell() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/activity", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setEvents(json.events ?? []);
        setUnread(json.count ?? 0);
      })
      .catch((err) => console.error("[PortalNotificationBell]", err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markSeen = useCallback(() => {
    setUnread(0);
    fetch("/api/portal/activity/seen", { method: "POST" }).catch(() => {});
  }, []);

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen && unread > 0) markSeen();
      return !wasOpen;
    });
  }

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="icon-btn w-5 h-5 rounded flex items-center justify-center"
        data-active={open ? "true" : undefined}
        onClick={toggle}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <BellIcon />
      </button>
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute flex items-center justify-center text-[10px] font-semibold pointer-events-none"
          style={{
            top: -3,
            right: -5,
            minWidth: 14,
            height: 14,
            borderRadius: 999,
            padding: "0 3px",
            background: "var(--action)",
            color: "var(--action-text)",
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute z-20 rounded-lg border shadow-lg flex flex-col"
          style={{
            top: "calc(100% + 6px)",
            right: 0,
            width: 400,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 480,
            background: "var(--bg-elevated)",
            borderColor: "var(--border)",
          }}
        >
          <header
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Notifications
            </span>
          </header>

          <div className="flex-1 overflow-y-auto">
            {events.length === 0 ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ color: "var(--text-muted)", padding: "32px 16px" }}
              >
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="flex flex-col" role="list">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-2"
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span
                      className="flex shrink-0 w-6 h-6 rounded-full items-center justify-center text-[10px] font-semibold"
                      style={{
                        background: avatarColor(e.actorName),
                        color: "var(--text-dark)",
                      }}
                      aria-hidden
                    >
                      {avatarInitials(e.actorName)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm" style={{ color: "var(--text)" }}>
                        <span className="font-medium">{e.actorName}</span>{" "}
                        <span style={{ color: "var(--text-secondary)" }}>{eventPhrase(e)}</span>
                      </span>
                      <span
                        className="block text-xs"
                        style={{ color: "var(--text-muted)", marginTop: 2 }}
                      >
                        {timeAgo(e.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
