"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Drawer from "@/app/ui/Drawer";
import { AttendeeChip } from "./MeetingsTab";

/**
 * Meeting transcript drawer. Renders inside the shared `Drawer`
 * primitive so it matches the kanban TaskDrawer's look (slide-in,
 * 520px right-edge panel, no dimmed backdrop) — Caroline wants the
 * two surfaces visually consistent.
 *
 * Triggered by clicking the meeting title pill in any draft card.
 * Always mounted by the parent (`AIDraftInbox`); `eventId` controls
 * the open state. ESC + outside-click close via the Drawer primitive.
 */
export default function MeetingDrawer({ eventId, onClose }) {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const open = eventId != null;

  useEffect(() => {
    if (!open) {
      // Clear state when the drawer closes so re-opening fetches fresh.
      setMeeting(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/meetings/${eventId}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        const body = await res.json();
        if (!cancelled) setMeeting(body);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, open]);

  return (
    <Drawer open={open} onClose={onClose} aria-label="Meeting details">
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Meeting</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-btn"
          style={{ padding: "4px 8px", fontSize: 12, color: "var(--text-muted)" }}
        >
          Close ✕
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {loading && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Loading transcript…</p>
        )}
        {error && (
          <div style={{ fontSize: 13, color: "var(--danger)" }}>
            Couldn&rsquo;t load meeting: {error}
          </div>
        )}
        {meeting && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                <span className="task-ref">{meeting.meetingTitle}</span>
              </h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {formatDate(meeting.occurredAt)}
              </span>
            </div>
            {meeting.attendees.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {meeting.attendees.map((a, i) => (
                  <AttendeeChip key={i} name={a.name} email={a.email} />
                ))}
              </div>
            )}
            {meeting.summary && (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--text-secondary)",
                }}
              >
                {meeting.summary}
              </p>
            )}

            {meeting.onboardingId != null && (
              <Link
                href={`/onboardings/${meeting.onboardingId}?tab=meetings`}
                style={{ fontSize: 12, color: "var(--action)", alignSelf: "flex-start" }}
              >
                Open in Meetings tab →
              </Link>
            )}

            {Array.isArray(meeting.extractionActionItems) &&
              meeting.extractionActionItems.length > 0 && (
                <DrawerSection
                  label={`Vector caught ${meeting.extractionActionItems.length} action item${
                    meeting.extractionActionItems.length === 1 ? "" : "s"
                  }`}
                >
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {meeting.extractionActionItems.map((item, i) => (
                      <li
                        key={i}
                        style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}
                      >
                        <span style={{ color: "var(--text)" }}>
                          <strong style={{ fontWeight: 500 }}>{item.claim}</strong>
                          {item.firmness && (
                            <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                              · {item.firmness}
                            </span>
                          )}
                        </span>
                        {item.sourceQuote && (
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontStyle: "italic",
                              lineHeight: 1.45,
                            }}
                          >
                            &ldquo;{item.sourceQuote}&rdquo;
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </DrawerSection>
              )}

            {Array.isArray(meeting.siblingDrafts) && meeting.siblingDrafts.length > 0 && (
              <DrawerSection
                label={`${meeting.siblingDrafts.length} draft${
                  meeting.siblingDrafts.length === 1 ? "" : "s"
                } from this meeting`}
              >
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {meeting.siblingDrafts.map((d) => (
                    <li
                      key={d.id}
                      style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}
                    >
                      <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.action}</code>
                      <span style={{ color: "var(--text)" }}>
                        {d.title ?? <em>(untitled)</em>}
                      </span>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 11,
                          marginLeft: "auto",
                        }}
                      >
                        {d.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>
            )}

            <DrawerSection label="Transcript">
              {meeting.transcript.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    margin: 0,
                    fontStyle: "italic",
                  }}
                >
                  No transcript on this meeting.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {meeting.transcript.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          flexShrink: 0,
                          minWidth: 110,
                        }}
                      >
                        {t.speaker}
                      </span>
                      <span
                        style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}
                      >
                        {t.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DrawerSection>
          </>
        )}
      </div>
    </Drawer>
  );
}

function DrawerSection({ label, children }) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-subtle)",
        paddingTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
