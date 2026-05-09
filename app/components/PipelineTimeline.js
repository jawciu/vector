"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

/**
 * Admin /admin/ai → Pipeline tab. Full timeline of every Miniti event
 * we've received (real + test runs), with filter chips and an expandable
 * row that shows the orchestrator pipeline trace + drafts produced.
 *
 * Server hands us a list pre-shaped by listExternalEventsForAdmin — the
 * filter operates client-side (the list is small enough — limit 100).
 */
const FILTERS = [
  { id: "all", label: "All" },
  { id: "processed", label: "Processed" },
  { id: "ambiguous", label: "Ambiguous" },
  { id: "stuck", label: "Stuck" },
  { id: "errored", label: "Errored" },
  { id: "test", label: "Test" },
];

export default function PipelineTimeline({ events = [] }) {
  const [filter, setFilter] = useState("all");
  const [openIds, setOpenIds] = useState(new Set());

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => matchesFilter(e, filter));
  }, [events, filter]);

  function toggleOpen(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const count = f.id === "all"
            ? events.length
            : events.filter((e) => matchesFilter(e, f.id)).length;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                color: active ? "var(--text)" : "var(--text-muted)",
                background: active ? "var(--surface-hover)" : "transparent",
                border: `1px solid ${active ? "var(--button-secondary-border)" : "var(--border-subtle)"}`,
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {f.label} <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "16px 0" }}>
          No events match this filter.
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((event) => (
          <PipelineRow
            key={event.id}
            event={event}
            isOpen={openIds.has(event.id)}
            onToggle={() => toggleOpen(event.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function matchesFilter(e, filter) {
  switch (filter) {
    case "processed": return e.processedAt != null && !e.error;
    case "ambiguous": return e.matchAmbiguous && e.processedAt == null;
    case "stuck":     return !e.matchAmbiguous && e.onboardingId != null && e.processedAt == null;
    case "errored":   return e.error != null;
    case "test":      return e.isTestRun;
    default:          return true;
  }
}

function PipelineRow({ event, isOpen, onToggle }) {
  const state = describeState(event);
  return (
    <li
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.meetingTitle}
          </span>
          {event.isTestRun && <TestRunBadge />}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <StateBadge {...state} />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatDate(event.occurredAt)}
          </span>
        </div>
      </button>
      {isOpen && <PipelineRowDetail event={event} />}
    </li>
  );
}

function PipelineRowDetail({ event }) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-subtle)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
        <span>
          Event id <code style={{ fontSize: 11 }}>{event.id}</code>
        </span>
        {event.onboardingId != null ? (
          <Link
            href={`/onboardings/${event.onboardingId}?tab=meetings`}
            style={{ color: "var(--action)" }}
          >
            {event.onboardingName ?? `#${event.onboardingId}`} → Meetings
          </Link>
        ) : (
          <span>(unassigned)</span>
        )}
        {event.processedAt && (
          <span>processed {formatDate(event.processedAt)}</span>
        )}
        {event.error && (
          <span style={{ color: "var(--danger)" }}>error: {event.error}</span>
        )}
      </div>

      {event.attendees.length > 0 && (
        <DetailSection label="Attendees">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {event.attendees.map((a, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  background: "var(--surface-hover)",
                  borderRadius: 12,
                  color: "var(--text)",
                }}
              >
                {a.name ?? a.email}
                {a.name && a.email && (
                  <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{a.email}</span>
                )}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {event.meetingSummary && (
        <DetailSection label="Summary (Miniti)">
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            {event.meetingSummary}
          </p>
        </DetailSection>
      )}

      <ExtractionPane extraction={event.orchestratorExtraction} />
      <ToolCallsPane calls={event.orchestratorOutput} />
      <DraftsPane drafts={event.drafts} />
      <TranscriptPane transcript={event.transcript} />
      <Collapsible label="orchestratorInput (raw context)" json={event.orchestratorInput} />
    </div>
  );
}

function ExtractionPane({ extraction }) {
  if (extraction == null) {
    return (
      <DetailSection label="Pass 1 — extraction">
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No extraction persisted (orchestrator never ran or Pass 1 failed).
        </span>
      </DetailSection>
    );
  }
  const items = extraction.actionItems ?? [];
  const completions = extraction.reportedCompletions ?? [];
  const blockers = extraction.externalBlockers ?? [];
  return (
    <DetailSection
      label={`Pass 1 — extraction · ${items.length} action items · ${completions.length} completions · tone ${extraction.meetingTone ?? "—"}`}
    >
      {items.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item, i) => (
            <li key={i} style={{ fontSize: 12 }}>
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>{item.claim}</strong>
              {item.firmness && (
                <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>· {item.firmness}</span>
              )}
              {item.sourceQuote && (
                <div style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>
                  &ldquo;{item.sourceQuote}&rdquo;
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {blockers.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          External blockers: {blockers.join(" · ")}
        </div>
      )}
      <Collapsible label="raw extraction JSON" json={extraction} />
    </DetailSection>
  );
}

function ToolCallsPane({ calls }) {
  if (calls == null) {
    return (
      <DetailSection label="Pass 2 — tool calls">
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No tool calls persisted.
        </span>
      </DetailSection>
    );
  }
  if (!Array.isArray(calls) || calls.length === 0) {
    return (
      <DetailSection label="Pass 2 — tool calls">
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>0 tool calls (Vector flagged this meeting as having no concrete actions).</span>
      </DetailSection>
    );
  }
  const counts = calls.reduce((acc, c) => {
    acc[c.tool] = (acc[c.tool] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([tool, n]) => `${n}× ${tool}`)
    .join(", ");
  return (
    <DetailSection label={`Pass 2 — tool calls · ${summary}`}>
      <Collapsible label="raw tool calls JSON" json={calls} />
    </DetailSection>
  );
}

function DraftsPane({ drafts }) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return null;
  }
  return (
    <DetailSection label={`Drafts produced · ${drafts.length}`}>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {drafts.map((d) => (
          <li key={d.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
            <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.action}</code>
            <span style={{ color: "var(--text)" }}>{d.title ?? <em>(untitled)</em>}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: "auto" }}>{d.status}</span>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}

function TranscriptPane({ transcript }) {
  if (!Array.isArray(transcript) || transcript.length === 0) return null;
  return (
    <Collapsible
      label={`Transcript (${transcript.length} utterance${transcript.length === 1 ? "" : "s"})`}
      content={
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflow: "auto" }}>
          {transcript.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ color: "var(--text-muted)", fontWeight: 500, minWidth: 110, flexShrink: 0 }}>
                {t.speaker}
              </span>
              <span style={{ color: "var(--text)", lineHeight: 1.5 }}>{t.text}</span>
            </div>
          ))}
        </div>
      }
    />
  );
}

function DetailSection({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Collapsible({ label, json, content }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>{label}</span>
      </button>
      {open && (
        content ?? (
          <pre
            style={{
              margin: 0,
              padding: "8px 10px",
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              overflow: "auto",
              maxHeight: 360,
            }}
          >
            {JSON.stringify(json, null, 2)}
          </pre>
        )
      )}
    </div>
  );
}

/**
 * Test-run badge — small flask SVG + tinted chip. Uses the AI gradient
 * stops so it reads as "Vector tooling" rather than "user-generated".
 */
export function TestRunBadge() {
  return (
    <span
      title="Fired from /admin/ai test webhook panel — not a real Miniti delivery"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        fontSize: 11,
        borderRadius: 4,
        background: "rgba(192, 152, 255, 0.12)",
        color: "var(--action)",
        border: "0.5px solid var(--action)",
      }}
    >
      <FlaskIcon />
      Test
    </span>
  );
}

function FlaskIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M5.5 1.5 H8.5 M6 1.5 V5.5 L3 11.25 A1 1 0 0 0 3.85 12.75 H10.15 A1 1 0 0 0 11 11.25 L8 5.5 V1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M4.5 9 H9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function StateBadge({ label, color }) {
  return (
    <span
      style={{
        fontSize: 10,
        color,
        padding: "1px 6px",
        borderRadius: 4,
        border: `0.5px solid ${color}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function describeState(e) {
  if (e.error) return { label: "errored", color: "var(--danger)" };
  if (e.matchAmbiguous && e.processedAt == null) return { label: "ambiguous", color: "var(--alert)" };
  if (!e.matchAmbiguous && e.onboardingId != null && e.processedAt == null) {
    return { label: "stuck", color: "var(--danger)" };
  }
  if (e.processedAt != null) return { label: "processed", color: "var(--success, #5cd6a5)" };
  return { label: "received", color: "var(--text-muted)" };
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
