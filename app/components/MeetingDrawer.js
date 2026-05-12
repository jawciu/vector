"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Drawer from "@/app/ui/Drawer";
import { AttendeeChip } from "./MeetingsTab";

/**
 * Meeting transcript drawer. Renders inside the shared `Drawer`
 * primitive so it matches the kanban TaskDrawer's look (slide-in,
 * 520px right-edge panel, no dimmed backdrop) — Caroline wants the
 * two surfaces visually consistent.
 *
 * Triggered by clicking a meeting row or a draft's meeting pill.
 * Always mounted by the parent; `eventId` controls the open state.
 *
 * Speed:
 *   - In-component cache (id → fetched body) so re-opening the same
 *     meeting is instant.
 *   - Optional `seed` prop: when the caller already has the meeting
 *     payload (MeetingsTab does), pass it through and the drawer paints
 *     immediately. A background fetch still runs to fill the richer
 *     fields (`extractionActionItems`, `siblingDrafts`, `onboardingId`).
 *
 * ESC + outside-click close via the Drawer primitive.
 */
export default function MeetingDrawer({ eventId, seed, onClose }) {
  const cacheRef = useRef(new Map());
  const seedFor = seed && seed.id === eventId ? seed : null;
  const cached = eventId != null ? cacheRef.current.get(eventId) : null;
  const [meeting, setMeeting] = useState(cached ?? seedFor ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const open = eventId != null;

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    // Paint immediately from cache or seed; fetch in background.
    const cached = cacheRef.current.get(eventId);
    if (cached) {
      setMeeting(cached);
    } else if (seedFor) {
      setMeeting(seedFor);
    } else {
      setMeeting(null);
    }
    let cancelled = false;
    setLoading(!cached);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/meetings/${eventId}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        const body = await res.json();
        if (cancelled) return;
        cacheRef.current.set(eventId, body);
        setMeeting(body);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // seedFor is derived from props; including `seed` covers it without
    // adding a new identity per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, open, seed]);

  return (
    <Drawer open={open} onClose={onClose} aria-label="Meeting details">
      {/* Body — close button lives in the Drawer primitive (top-right). */}
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
        {loading && !meeting && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Loading transcript…</p>
        )}
        {error && (
          <div style={{ fontSize: 13, color: "var(--danger)" }}>
            Couldn&rsquo;t load meeting: {error}
          </div>
        )}
        {meeting && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 24 }}>
              <h2 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Meeting</span>
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
