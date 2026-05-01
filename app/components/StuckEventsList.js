"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Admin list of events Vector started processing but never finished —
 * typically Vercel killed the function on the orchestrator path. Each row
 * has a Reprocess button that re-runs the orchestrator (idempotent).
 */
export default function StuckEventsList({ initialEvents }) {
  const [events, setEvents] = useState(initialEvents);
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleReprocess(id) {
    setBusy(id, true);
    setErrors((e) => ({ ...e, [id]: null }));
    try {
      const res = await fetch(`/api/external-events/${id}/reprocess`, { method: "POST" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Reprocess failed (${res.status})`);
      }
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: err.message }));
    } finally {
      setBusy(id, false);
    }
  }

  async function handleReprocessAll() {
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await fetch("/api/external-events/reprocess-all-stuck", { method: "POST" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Reprocess-all failed (${res.status})`);
      }
      const body = await res.json();
      // Optimistically clear the list — orchestrators run async; if any
      // re-fail, they'll reappear on the next page refresh.
      setEvents([]);
      setBulkResult(`Scheduled ${body.scheduled} reprocess${body.scheduled === 1 ? "" : "es"}. Refresh in ~15s to see updated state.`);
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  if (events.length === 0 && !bulkResult) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleReprocessAll}
            disabled={bulkBusy}
            className="btn-secondary text-sm rounded-lg"
            style={{ padding: "4px 10px", fontSize: 12, opacity: bulkBusy ? 0.5 : 1 }}
          >
            {bulkBusy ? "Scheduling…" : `Reprocess all ${events.length}`}
          </button>
        </div>
      )}
      {bulkResult && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            background: "var(--bg)",
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          {bulkResult}
        </div>
      )}
      {bulkError && (
        <div
          style={{
            fontSize: 12,
            color: "var(--danger)",
            background: "rgba(255, 137, 155, 0.1)",
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          {bulkError}
        </div>
      )}
      <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
      {events.map((event) => {
        const busy = busyIds.has(event.id);
        const error = errors[event.id];
        return (
          <li
            key={event.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 12px",
              background: "var(--bg)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {event.meetingTitle}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                {event.onboardingName ?? `Onboarding #${event.onboardingId}`} · stuck for {event.ageMinutes}m
              </div>
              {error && (
                <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>{error}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <Link
                href={`/onboardings/${event.onboardingId}`}
                style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 8px" }}
              >
                View
              </Link>
              <button
                onClick={() => handleReprocess(event.id)}
                disabled={busy}
                className="btn-secondary text-sm rounded-lg"
                style={{ padding: "4px 10px", fontSize: 12, opacity: busy ? 0.5 : 1 }}
              >
                {busy ? "…" : "Reprocess"}
              </button>
            </div>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
