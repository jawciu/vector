"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Manual trigger for the stale-task scanner. Calls
 * /api/orchestrator/scan-now (vendor-scoped — only scans your tasks) and
 * surfaces a one-line result. Drafts land in /ai-drafts.
 *
 * UX: scan can take 30-60s on a busy week (it makes one Claude call per
 * stale task back-to-back), so we show an elapsed-time counter while busy
 * to make it clear something's still happening.
 */
export default function ScanStaleButton() {
  const [busy, setBusy] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const tickRef = useRef(null);

  // Tick a per-second counter while the scan is in flight so the button
  // doesn't look frozen. Reset when busy flips off.
  useEffect(() => {
    if (busy) {
      setElapsedSec(0);
      tickRef.current = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [busy]);

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleClick}
          disabled={busy}
          className="btn-primary text-sm rounded-lg"
          style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, opacity: busy ? 0.6 : 1, minWidth: 160 }}
        >
          {busy ? `Scanning… ${elapsedSec}s` : "Scan now"}
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Looks at your overdue and blocked tasks; queues drafts in <a href="/ai-drafts" style={{ color: "var(--action)" }}>Vector suggests</a>. Can take ~30s on busy weeks.
        </span>
      </div>
      {result && <ScanResult result={result} />}
      {error && (
        <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ScanResult({ result }) {
  const { scanned = 0, drafted = 0, skippedExisting = 0, failed = 0, errors = [] } = result;

  if (scanned === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }} aria-live="polite">
        Nothing stale on your tasks right now ✓
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 }} aria-live="polite">
      <div>
        Scanned {scanned}, drafted <strong>{drafted}</strong>
        {skippedExisting > 0 && <>, skipped {skippedExisting} (already drafted)</>}
        {failed > 0 && <>, <span style={{ color: "var(--danger)" }}>failed {failed}</span></>}.
        {drafted > 0 && (
          <> <a href="/ai-drafts" style={{ color: "var(--action)" }}>Review →</a></>
        )}
      </div>
      {failed > 0 && errors.length > 0 && (
        <details style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer" }}>Show failed task ids</summary>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {errors.map((e, i) => (
              <li key={i}>#{e.taskId}: {e.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
