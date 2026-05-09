"use client";

import { useEffect, useRef, useState } from "react";
import InlineEventDrafts from "./InlineEventDrafts";
import { MetaDot, ChevronRight, FollowupSparkleIcon as MinitiSparkleIcon } from "./AIDraftInbox";
import { MenuList, MenuOption } from "./Menu";
import { AttendeeChip } from "./MeetingsTab";

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
 * Streaming-state border: the AI gradient ring shows from Assign click
 * until the first draft lands. Once drafts arrive the inline panel
 * carries the visual signal — the parent ring fades out (2s) so the
 * card doesn't look like it's still working.
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
  // eventId → true once at least one draft has landed in the inline panel.
  // Used to fade the AI gradient border on the parent card.
  const [draftsArrived, setDraftsArrived] = useState({});

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

          // Streaming border lights up between Assign click and the
          // first draft landing in the inline panel — after that the
          // inline cards carry the AI signal so the parent ring fades.
          const isProcessing =
            assignedOnboardingId != null && !draftsArrived[event.id];
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
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {attendees.map((a, i) => (
                      <AttendeeChip key={i} name={a.name} email={a.email} />
                    ))}
                  </div>
                )}

                {actionItems.length > 0 && (
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {actionItems.slice(0, 3).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                    {actionItems.length > 3 && (
                      <li style={{ color: "var(--text-muted)" }}>
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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <OnboardingPicker
                    value={onboardingId ?? ""}
                    onChange={(v) => setSelections((s) => ({ ...s, [event.id]: v }))}
                    onboardings={onboardings}
                    disabled={busy}
                  />
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
                    onDraftsArrived={() =>
                      setDraftsArrived((prev) =>
                        prev[event.id] ? prev : { ...prev, [event.id]: true }
                      )
                    }
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

/** Onboarding picker — Menu-primitive dropdown matching the rest of
 *  the app's filter pills. Replaces the native <select> which Safari /
 *  Chrome render with a clashing blue focus ring. */
function OnboardingPicker({ value, onChange, onboardings, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected = onboardings.find((ob) => String(ob.id) === String(value));
  const label = selected ? selected.companyName : "Pick onboarding…";

  return (
    <div ref={ref} className="relative" style={{ minWidth: 220 }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="field-pill flex items-center gap-2 rounded-lg"
        data-active={open ? "true" : undefined}
        style={{
          width: "100%",
          border: "1px solid var(--button-secondary-border)",
          padding: "4px 10px",
          minHeight: 30,
          background: "var(--bg)",
          color: selected ? "var(--text)" : "var(--text-muted)",
          fontSize: 13,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            flex: 1,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <PickerChevron open={open} />
      </button>
      {open && (
        <MenuList
          style={{
            width: "100%",
            maxHeight: 240,
            overflowY: "auto",
            left: "auto",
            right: 0,
          }}
        >
          {onboardings.length === 0 ? (
            <div style={{ padding: "4px 8px", fontSize: 12, color: "var(--text-muted)" }}>
              No onboardings
            </div>
          ) : (
            onboardings.map((ob) => (
              <MenuOption
                key={ob.id}
                active={String(ob.id) === String(value)}
                onClick={() => {
                  onChange(String(ob.id));
                  setOpen(false);
                }}
              >
                {ob.companyName}
              </MenuOption>
            ))
          )}
        </MenuList>
      )}
    </div>
  );
}

function PickerChevron({ open }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      style={{
        flexShrink: 0,
        color: "var(--text-muted)",
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform 0.15s ease",
      }}
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
