"use client";

import { useState } from "react";
import InlineEventDrafts from "./InlineEventDrafts";

/**
 * "Unmatched meetings" panel — shown above the drafts list when Miniti
 * sends a meeting we couldn't auto-route. Vendor picks the right
 * onboarding from a dropdown; assignment kicks off the orchestrator
 * which produces drafts a few seconds later.
 *
 * After a successful Assign + process, the card stays in place and
 * embeds an `InlineEventDrafts` panel that polls for the new drafts and
 * renders them with the same Approve / Edit / Dismiss controls as the
 * Actions tab. Once all inline drafts are handled (option a per
 * Caroline) the unmatched card auto-collapses.
 *
 * Props:
 *   initialEvents — ExternalEvent rows where matchAmbiguous=true
 *   onboardings   — [{ id, companyName }] for the picker
 */
export default function UnmatchedEvents({ initialEvents, onboardings }) {
  const [events, setEvents] = useState(initialEvents);
  const [selections, setSelections] = useState({}); // eventId → onboardingId
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  // After a successful assign, eventId → assignedOnboardingId. The card
  // stays in the list (we removed it from `events` only when the inline
  // drafts have all been handled).
  const [assigned, setAssigned] = useState({});

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAssign(eventId) {
    const onboardingId = selections[eventId];
    if (!onboardingId) {
      setErrors((e) => ({ ...e, [eventId]: "Pick an onboarding first" }));
      return;
    }
    setBusy(eventId, true);
    setErrors((e) => ({ ...e, [eventId]: null }));
    try {
      const res = await fetch(`/api/external-events/${eventId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingId: Number(onboardingId) }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Assign failed (${res.status})`);
      }
      // Don't remove the event yet — keep the card visible and embed
      // the inline drafts panel below it. The card auto-collapses
      // (option a) once all inline drafts have been handled.
      setAssigned((prev) => ({ ...prev, [eventId]: Number(onboardingId) }));
    } catch (err) {
      setErrors((e) => ({ ...e, [eventId]: err.message }));
    } finally {
      setBusy(eventId, false);
    }
  }

  if (events.length === 0) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          Needs your input
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {events.length} meeting{events.length === 1 ? "" : "s"} Vector couldn&apos;t auto-match
        </span>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.map((event) => {
          const meeting = event.payload?.meeting ?? {};
          const attendees = meeting.attendees ?? [];
          const actionItems = meeting.action_items ?? [];
          const onboardingId = selections[event.id];
          const busy = busyIds.has(event.id);
          const error = errors[event.id];
          const assignedOnboardingId = assigned[event.id];
          const assignedOnboardingName = assignedOnboardingId != null
            ? onboardings.find((ob) => ob.id === assignedOnboardingId)?.companyName ?? `#${assignedOnboardingId}`
            : null;

          const isProcessing = assignedOnboardingId != null;
          return (
            <div
              key={event.id}
              className={`ai-generating${isProcessing ? " is-streaming" : ""}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 32,
                padding: 24,
                borderRadius: 20,
                border: "1px solid var(--button-secondary-border)",
                background: "var(--bg)",
              }}
            >
              {/* Header — breadcrumb + meta rows, mirroring FollowupCard */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                    Unmatched meeting
                  </span>
                  <ChevronRight />
                  <span className="task-ref">{meeting.title ?? "(untitled meeting)"}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 12 }}>
                    <MinitiSparkleIcon />
                    From miniti
                  </span>
                  <MetaDot />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDate(meeting.date)}</span>
                  <MetaDot />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {actionItems.length} action item{actionItems.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {/* Body — attendees + raw action items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {attendees.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Attendees: </span>
                    {attendees.map((a) => `${a.name ?? a.email} (${a.domain ?? "?"})`).join(", ")}
                  </div>
                )}

                {actionItems.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {actionItems.slice(0, 3).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                    {actionItems.length > 3 && (
                      <li style={{ color: "var(--text-muted)", listStyle: "none" }}>
                        …and {actionItems.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>


              {error && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--danger)",
                    background: "rgba(255, 137, 155, 0.1)",
                    padding: "6px 10px",
                    borderRadius: 6,
                  }}
                >
                  {error}
                </div>
              )}

              {assignedOnboardingId == null ? (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                  <select
                    value={onboardingId ?? ""}
                    onChange={(e) => setSelections((s) => ({ ...s, [event.id]: e.target.value }))}
                    disabled={busy}
                    className="rounded-lg"
                    style={{
                      padding: "4px 10px",
                      fontSize: 13,
                      background: "var(--bg-elevated)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                      minWidth: 200,
                    }}
                  >
                    <option value="">Pick onboarding…</option>
                    {onboardings.map((ob) => (
                      <option key={ob.id} value={ob.id}>
                        {ob.companyName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAssign(event.id)}
                    disabled={busy || !onboardingId}
                    className="btn-primary text-sm rounded-lg"
                    style={{
                      padding: "4px 14px",
                      opacity: busy || !onboardingId ? 0.5 : 1,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {busy ? "…" : "Assign + process"}
                  </button>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      borderTop: "1px solid var(--border-subtle)",
                      paddingTop: 10,
                    }}
                  >
                    Assigned to <strong style={{ color: "var(--text)" }}>{assignedOnboardingName}</strong>.
                    Drafts also appear on the{" "}
                    <a
                      href={`/onboardings/${assignedOnboardingId}?tab=actions`}
                      style={{ color: "var(--action)" }}
                    >
                      Actions tab
                    </a>.
                  </div>
                  <InlineEventDrafts
                    eventId={event.id}
                    onboardingId={assignedOnboardingId}
                    onAllHandled={() =>
                      setEvents((prev) => prev.filter((e) => e.id !== event.id))
                    }
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
