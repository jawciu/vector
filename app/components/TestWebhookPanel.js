"use client";

import { useState } from "react";

/**
 * Admin tool — POSTs a fixture payload at our own Miniti webhook.
 *
 * The token + payload only ever live server-side; this just sends
 * { fixture: "..." } to /api/admin/test-webhook which does the forward.
 */
export default function TestWebhookPanel({ fixtures }) {
  const [selected, setSelected] = useState(fixtures[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSend() {
    setBusy(true);
    setError(null);
    setResult(null);
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

  const draftCount =
    result?.response?.eventId != null
      ? // The webhook ack returns { ok, eventId, onboardingId, matchedBy, ambiguous }
        // but the orchestrator runs in `after()` so draft count isn't in the response.
        // We surface what we have and tell the user to refresh.
        null
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
        Fires a sample Miniti payload at our local webhook. Useful for
        iterating on the orchestrator prompt — drafts land in
        <code style={{ marginLeft: 4 }}>/ai-drafts</code>; the persisted
        I/O is visible in the stuck-events debug toggle.
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
          <div>
            <strong>Fixture:</strong> <code style={{ fontSize: 11 }}>{result.fixture}</code>
          </div>
          <div>
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
          {result.response?.deduped && (
            <div style={{ color: "var(--text-muted)" }}>Deduped — meeting.id already seen.</div>
          )}
          {result.response?.error && (
            <div style={{ color: "var(--danger)" }}>{result.response.error}</div>
          )}
          {draftCount === null && result.response?.eventId != null && !result.response?.ambiguous && (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Orchestrator runs after the ack — refresh in ~10s to see drafts and the persisted I/O.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
