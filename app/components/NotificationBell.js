"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarColor, avatarInitials } from "@/lib/avatar";

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

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
  switch (e.verb) {
    case "created": return `created "${md.title ?? "a task"}"`;
    case "completed": return `completed "${md.title ?? "a task"}"`;
    case "status_changed": return `moved "${md.title ?? "a task"}" → ${md.to ?? "—"}`;
    case "commented": return `commented on "${md.taskTitle ?? "a task"}"`;
    case "uploaded": return `uploaded ${md.fileName ?? "a file"}${md.taskTitle ? ` to "${md.taskTitle}"` : ""}`;
    case "link_activated": return `opened their portal for the first time`;
    default: return e.verb;
  }
}

function groupSummary(group) {
  if (group.events.length > 1) return `made ${group.events.length} changes`;
  return eventPhrase(group.events[0]);
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unreadCount: 0, groups: [] });
  const [expanded, setExpanded] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[NotificationBell] refetch failed", err);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

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

  const markGroupRead = useCallback(async (groupKey) => {
    try {
      await fetch(`/api/notifications/group/${encodeURIComponent(groupKey)}/read`, { method: "POST" });
      await refetch();
    } catch (err) {
      console.error("[NotificationBell] mark group read failed", err);
    }
  }, [refetch]);

  async function markAllRead() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      await refetch();
    } finally {
      setLoading(false);
    }
  }

  function navigateToOnboarding(onboardingId) {
    setOpen(false);
    router.push(`/onboardings/${onboardingId}`);
  }

  function handleGroupClick(group) {
    if (group.events.length === 1) {
      if (group.unreadCount > 0) markGroupRead(group.groupKey);
      navigateToOnboarding(group.onboardingId);
      return;
    }
    // Multi-event: toggle expansion, mark read on first expand
    const isOpen = expanded.has(group.groupKey);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(group.groupKey);
      else next.add(group.groupKey);
      return next;
    });
    if (!isOpen && group.unreadCount > 0) markGroupRead(group.groupKey);
  }

  function handleSubEventClick(group) {
    navigateToOnboarding(group.onboardingId);
  }

  const badge = data.unreadCount > 99 ? "99+" : String(data.unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="icon-btn w-5 h-5 rounded flex items-center justify-center"
        data-active={open ? "true" : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <BellIcon />
      </button>
      {data.unreadCount > 0 && (
        <span
          aria-hidden
          className="absolute flex items-center justify-center text-[10px] font-semibold pointer-events-none"
          style={{
            top: -4,
            right: -6,
            minWidth: 16,
            height: 16,
            borderRadius: 999,
            padding: "0 4px",
            background: "var(--danger)",
            color: "var(--text-dark)",
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
            {data.unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs transition-colors"
                style={{ color: "var(--text-muted)" }}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            {data.groups.length === 0 ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ color: "var(--text-muted)", padding: "32px 16px" }}
              >
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="flex flex-col" role="list">
                {data.groups.map((g) => {
                  const isMulti = g.events.length > 1;
                  const isExpanded = expanded.has(g.groupKey);
                  const isRead = g.allRead;
                  const nameColor = isRead ? "var(--text-muted)" : "var(--text)";
                  const summaryColor = isRead ? "var(--text-muted)" : "var(--text-secondary)";
                  return (
                    <li key={g.groupKey}>
                      <button
                        type="button"
                        onClick={() => handleGroupClick(g)}
                        className="w-full flex items-start gap-2 text-left transition-colors"
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid var(--border-subtle)",
                          background: isRead ? "transparent" : "var(--bg-hover)",
                        }}
                      >
                        <span
                          className="flex shrink-0 w-6 h-6 rounded-full items-center justify-center text-[10px] font-semibold"
                          style={{
                            background: avatarColor(g.actorName),
                            color: "var(--text-dark)",
                            opacity: isRead ? 0.7 : 1,
                          }}
                          aria-hidden
                        >
                          {avatarInitials(g.actorName)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm" style={{ color: nameColor }}>
                            <span className="font-medium">{g.actorName}</span>{" "}
                            <span style={{ color: summaryColor }}>{groupSummary(g)}</span>
                          </span>
                          <span
                            className="block text-xs truncate"
                            style={{ color: "var(--text-muted)", marginTop: 2 }}
                          >
                            {g.onboardingName} · {timeAgo(g.latestAt)}
                          </span>
                        </span>
                        {isMulti ? (
                          <span
                            className="shrink-0 flex items-center justify-center"
                            style={{ width: 16, height: 16, marginTop: 4, color: "var(--text-muted)" }}
                          >
                            <ChevronIcon open={isExpanded} />
                          </span>
                        ) : null}
                        {!isRead && !isMulti && (
                          <span
                            aria-hidden
                            className="shrink-0 rounded-full"
                            style={{
                              width: 8,
                              height: 8,
                              marginTop: 6,
                              background: "var(--action)",
                            }}
                          />
                        )}
                        {!isRead && isMulti && (
                          <span
                            aria-hidden
                            className="shrink-0 rounded-full"
                            style={{
                              width: 6,
                              height: 6,
                              marginLeft: -12,
                              marginRight: 4,
                              marginTop: 7,
                              background: "var(--action)",
                            }}
                          />
                        )}
                      </button>

                      {isMulti && isExpanded && (
                        <ul
                          className="flex flex-col"
                          style={{
                            background: "var(--bg)",
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                          role="list"
                        >
                          {g.events.map((e) => (
                            <li key={e.notificationId}>
                              <button
                                type="button"
                                onClick={() => handleSubEventClick(g)}
                                className="w-full flex items-start gap-2 text-left transition-colors"
                                style={{ padding: "6px 12px 6px 40px" }}
                              >
                                <span
                                  aria-hidden
                                  className="shrink-0 rounded-full"
                                  style={{
                                    width: 4,
                                    height: 4,
                                    marginTop: 8,
                                    background: "var(--text-muted)",
                                  }}
                                />
                                <span className="flex-1 min-w-0">
                                  <span
                                    className="block text-xs truncate"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    {eventPhrase(e)}
                                  </span>
                                </span>
                                <span
                                  className="shrink-0 text-[10px]"
                                  style={{ color: "var(--text-muted)", marginTop: 3 }}
                                >
                                  {timeAgo(e.createdAt)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
