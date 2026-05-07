"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/**
 * Admin tool — POSTs a fixture payload at our own Miniti webhook, then
 * polls /api/admin/event-debug/[id] until the orchestrator finishes
 * (Pass 1 + Pass 2). Renders the meeting title, Pass 1 extraction
 * summary + JSON, and Pass 2 tool-call summary + JSON inline so the
 * operator never has to leave the page to debug a fixture.
 *
 * The token + payload only ever live server-side; this just sends
 * { fixture: "..." } to /api/admin/test-webhook which does the forward.
 */
export default function TestWebhookPanel({ fixtures }) {
  const [selected, setSelected] = useState(fixtures[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState(null); // polled event-debug payload
  const [polling, setPolling] = useState(false);
  const pollTimer = useRef(null);
  const pollDeadline = useRef(0);

  // Stop any in-flight polling when the component unmounts or a new
  // Send fires.
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  function stopPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    setPolling(false);
  }

  function pollEventDebug(eventId) {
    // Up to 60s of polling at 2s intervals — orchestrator is single-pass
    // ~5-10s, two-pass closer to ~12-20s so 60s is plenty headroom.
    pollDeadline.current = Date.now() + 60_000;
    setPolling(true);
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/event-debug/${eventId}`, { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          setDebug(body);
          // Stop polling when Pass 2 has written orchestratorOutput OR
          // processedAt is set (which means the orchestrator finished or
          // explicitly errored — the row carries `error` in that case).
          if (body.orchestratorOutput != null || body.processedAt != null) {
            stopPolling();
            return;
          }
        }
      } catch {
        // Swallow — keep retrying. Network blips shouldn't kill the loop.
      }
      if (Date.now() < pollDeadline.current) {
        pollTimer.current = setTimeout(tick, 2000);
      } else {
        stopPolling();
      }
    };
    tick();
  }

  async function handleSend() {
    setBusy(true);
    setError(null);
    setResult(null);
    setDebug(null);
    stopPolling();
    try {
      const res = await fetch("/api/admin/test-webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixture: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setResult(body);
      const eventId = body?.response?.eventId;
      const ambiguous = body?.response?.ambiguous;
      if (eventId != null && !ambiguous) {
        pollEventDebug(eventId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (fixtures.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        No fixtures found in <code>lib/integrations/miniti/fixtures/</code>.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
        Fires a sample Miniti payload at our local webhook. The
        orchestrator runs after the ack and writes Pass 1 (extraction)
        and Pass 2 (tool calls) to the event row; both surface here as
        soon as they land.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            color: "var(--text)",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            minWidth: 220,
          }}
        >
          {fixtures.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button
          onClick={handleSend}
          disabled={busy || !selected}
          className="btn-primary text-sm rounded-lg"
          style={{ padding: "6px 14px", fontSize: 13, opacity: busy ? 0.5 : 1 }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
        {polling && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
            Polling for orchestrator results…
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "var(--danger)",
            background: "rgba(255, 137, 155, 0.1)",
            padding: "8px 12px",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text)",
            background: "var(--bg)",
            border: "1px solid var(--border-subtle)",
            padding: "10px 12px",
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div>
            <strong>Status:</strong> {result.status} {result.ok ? "ok" : "error"}
          </div>
          {result.meetingTitle && (
            <div>
              <strong>Meeting:</strong> <span className="task-ref">{result.meetingTitle}</span>
            </div>
          )}
          <div>
            <strong>Fixture:</strong> <code style={{ fontSize: 11 }}>{result.fixture}</code>
            {" · "}
            <strong>Meeting id:</strong> <code style={{ fontSize: 11 }}>{result.meetingId}</code>
          </div>
          {result.response?.eventId != null && (
            <div>
              <strong>Event id:</strong> {result.response.eventId}
              {result.response.matchedBy && (
                <> · matched by <code style={{ fontSize: 11 }}>{result.response.matchedBy}</code></>
              )}
              {result.response.ambiguous && <> · <span style={{ color: "var(--alert)" }}>ambiguous</span></>}
            </div>
          )}
          {result.response?.onboardingId != null && !result.response?.ambiguous && (
            <div>
              <strong>Onboarding:</strong>{" "}
              <Link
                href={`/onboardings/${result.response.onboardingId}?tab=workflows`}
                style={{ color: "var(--action)" }}
              >
                #{result.response.onboardingId} → Workflows tab
              </Link>
            </div>
          )}
          {result.response?.ambiguous && (
            <div style={{ color: "var(--alert)" }}>
              Couldn&rsquo;t auto-match to a single onboarding. Drops into the global{" "}
              <Link href="/ai-drafts" style={{ color: "var(--action)" }}>/ai-drafts</Link>{" "}
              page for manual assignment.
            </div>
          )}
          {result.response?.deduped && (
            <div style={{ color: "var(--text-muted)" }}>Deduped — meeting.id already seen.</div>
          )}
          {result.response?.error && (
            <div style={{ color: "var(--danger)" }}>{result.response.error}</div>
          )}
        </div>
      )}

      {debug && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "10px 12px",
            background: "var(--bg)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>Orchestrator pipeline</strong>
            {debug.processedAt && (
              <> · processed {new Date(debug.processedAt).toLocaleTimeString()}</>
            )}
            {debug.error && (
              <> · <span style={{ color: "var(--danger)" }}>error: {debug.error}</span></>
            )}
          </div>
          <ExtractionSummary extraction={debug.orchestratorExtraction} polling={polling} />
          <ToolCallsSummary calls={debug.orchestratorOutput} polling={polling} />
        </div>
      )}
    </div>
  );
}

function ExtractionSummary({ extraction, polling }) {
  if (extraction == null) {
    return (
      <SummaryRow
        label="Pass 1 — extraction"
        empty={polling ? "running…" : "not yet"}
      />
    );
  }
  const items = extraction.actionItems ?? [];
  const completions = extraction.reportedCompletions ?? [];
  const blockers = extraction.externalBlockers ?? [];
  const tone = extraction.meetingTone ?? "—";
  return (
    <Collapsible
      label="Pass 1 — extraction"
      summary={
        <>
          {items.length} action item{items.length === 1 ? "" : "s"} ·{" "}
          {completions.length} completion{completions.length === 1 ? "" : "s"} ·{" "}
          {blockers.length} external blocker{blockers.length === 1 ? "" : "s"} ·{" "}
          tone <code style={{ fontSize: 11 }}>{tone}</code>
        </>
      }
      json={extraction}
    />
  );
}

function ToolCallsSummary({ calls, polling }) {
  if (calls == null) {
    return (
      <SummaryRow
        label="Pass 2 — tool calls"
        empty={polling ? "running…" : "not yet"}
      />
    );
  }
  if (!Array.isArray(calls) || calls.length === 0) {
    return (
      <SummaryRow label="Pass 2 — tool calls" empty="0 tool calls" />
    );
  }
  // Tally by tool name for the one-line summary.
  const counts = calls.reduce((acc, c) => {
    acc[c.tool] = (acc[c.tool] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([tool, n]) => `${n}× ${tool}`)
    .join(", ");
  return (
    <Collapsible
      label="Pass 2 — tool calls"
      summary={summary}
      json={calls}
    />
  );
}

function SummaryRow({ label, empty }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
      <strong style={{ color: "var(--text)" }}>{label}:</strong>
      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{empty}</span>
    </div>
  );
}

function Collapsible({ label, summary, json }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: 12,
          color: "var(--text)",
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>{open ? "▾" : "▸"}</span>
        <strong>{label}:</strong>
        <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{summary}</span>
      </button>
      {open && (
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
      )}
    </div>
  );
}
