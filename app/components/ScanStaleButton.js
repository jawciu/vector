"use client";

import { useState } from "react";

/**
 * Manual trigger for the stale-task scanner. Calls
 * /api/orchestrator/scan-now (vendor-scoped — only scans your tasks) and
 * surfaces a one-line result. Drafts land in /ai-drafts.
 */
export default function ScanStaleButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/orchestrator/scan-now", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setResult(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleClick}
          disabled={busy}
          className="btn-primary text-sm rounded-lg"
          style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, opacity: busy ? 0.5 : 1 }}
        >
          {busy ? "Scanning…" : "Scan now"}
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Looks at your overdue and blocked tasks; queues follow-up drafts in <a href="/ai-drafts" style={{ color: "var(--action)" }}>Vector suggests</a>.
        </span>
      </div>
      {result && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Scanned {result.scanned}, drafted <strong>{result.drafted}</strong>, skipped {result.skipped}.
          {result.drafted > 0 && (
            <> <a href="/ai-drafts" style={{ color: "var(--action)" }}>Review →</a></>
          )}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
