"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const SOFT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * AI Insights panel — onboarding scope.
 *
 * Decides on mount whether to render cached or regenerate, then streams
 * Claude's response into the UI.
 *
 * Props:
 *   scope        — "onboarding" | "portfolio"
 *   scopeId      — string identifier
 *   snapshot     — Layer 1 deterministic snapshot (built server-side)
 *   contextHash  — hash of the snapshot (built server-side)
 *   cachedInsight — { contextHash, payload, generatedAt } | null
 */
export default function InsightsPanel({
  scope = "onboarding",
  scopeId,
  snapshot,
  contextHash,
  cachedInsight,
}) {
  const [payload, setPayload] = useState(cachedInsight?.payload ?? null);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState(() => initialStatus(cachedInsight, contextHash));
  const [error, setError] = useState(null);
  const triggeredRef = useRef(false);

  function initialStatus(cached, hash) {
    if (!cached) return "needs-generate";
    if (cached.contextHash !== hash) return "stale";
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age > SOFT_TTL_MS) return "stale";
    return "fresh";
  }

  const regenerate = useCallback(async () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    setStatus("streaming");
    setStreamingText("");
    setError(null);

    let res;
    try {
      res = await fetch(`/api/insights/${scope}/${scopeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, contextHash }),
      });
    } catch (err) {
      setError(`Network error: ${err.message}`);
      setStatus("error");
      triggeredRef.current = false;
      return;
    }

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => "");
      setError(`Generate failed (${res.status}): ${errBody}`);
      setStatus("error");
      triggeredRef.current = false;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload = null;
    let persistData = null;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split SSE messages (data: {...}\n\n).
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!raw.startsWith("data:")) continue;
          const json = raw.slice(5).trim();
          let event;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }

          if (event.delta) {
            setStreamingText((prev) => prev + event.delta);
          } else if (event.done) {
            finalPayload = event.payload;
            persistData = event.persistData;
          } else if (event.error) {
            setError(event.error);
            setStatus("error");
            triggeredRef.current = false;
            return;
          }
        }
      }
    } catch (err) {
      setError(`Stream error: ${err.message}`);
      setStatus("error");
      triggeredRef.current = false;
      return;
    }

    if (finalPayload) {
      setPayload(finalPayload);
      setStatus("fresh");
    }

    // Fire-and-forget persistence to the Node save route.
    if (persistData) {
      fetch("/api/insights/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(persistData),
      }).catch((err) => console.warn("[InsightsPanel] save failed", err));
    }

    triggeredRef.current = false;
  }, [scope, scopeId, snapshot, contextHash]);

  // Auto-trigger on mount when cache is missing or stale.
  useEffect(() => {
    if (status === "needs-generate" || status === "stale") {
      regenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showStreamingText = status === "streaming" && !payload;
  const showCards = !!payload && status !== "streaming";
  const showStaleWithRegenerating = !!payload && status === "streaming";

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: "24px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Hero — headline + tldr */}
        <Hero
          payload={payload}
          streamingText={streamingText}
          status={status}
          showStreamingText={showStreamingText}
          showStaleWithRegenerating={showStaleWithRegenerating}
          onRegenerate={regenerate}
        />

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(255, 137, 155, 0.1)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Cards grid */}
        {showCards && payload && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FocusCard title="Focus today" items={payload.focusToday} kind="today" />
            <FocusCard title="This week" items={payload.focusThisWeek} kind="week" />
            <RisksCard risks={payload.risks} />
            <WinsCard wins={payload.wins} />
            {payload.nudges?.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <NudgesCard nudges={payload.nudges} />
              </div>
            )}
          </div>
        )}

        {!showCards && !showStreamingText && status === "needs-generate" && !error && (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Vector is taking a look…</div>
        )}
      </div>
    </div>
  );
}

function Hero({ payload, streamingText, status, showStreamingText, showStaleWithRegenerating, onRegenerate }) {
  const headline = showStreamingText
    ? extractHeadlineFromPartial(streamingText) || "Generating…"
    : payload?.headline || "—";
  const tldr = showStreamingText
    ? extractTldrFromPartial(streamingText) || ""
    : payload?.tldr || "";
  const trend = payload?.trend;

  return (
    <div
      style={{
        padding: "24px 28px",
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <SparkleIcon />
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" }}>
              Vector
            </span>
            {trend && <TrendPill trend={trend} />}
            {showStaleWithRegenerating && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                regenerating…
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, margin: 0 }}>
            {headline}
          </h1>
          {tldr && (
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
              {tldr}
            </p>
          )}
        </div>
        <button
          onClick={onRegenerate}
          disabled={status === "streaming"}
          className="btn-secondary text-sm rounded-lg"
          style={{
            padding: "6px 12px",
            opacity: status === "streaming" ? 0.5 : 1,
            cursor: status === "streaming" ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          {status === "streaming" ? "…" : "↻ Regenerate"}
        </button>
      </div>
    </div>
  );
}

function FocusCard({ title, items, kind }) {
  return (
    <Card title={title}>
      {(!items || items.length === 0) ? (
        <Empty>Nothing pressing {kind === "today" ? "today" : "this week"}.</Empty>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((item, i) => (
            <li key={i} style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
              {kind === "today" && item.taskId && (
                <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 11, marginRight: 6 }}>
                  #{item.taskId}
                </span>
              )}
              {item.reason || item.summary}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RisksCard({ risks }) {
  return (
    <Card title="Risks">
      {(!risks || risks.length === 0) ? (
        <Empty>No active risks flagged.</Empty>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
          {risks.map((r, i) => (
            <li key={i} style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <SeverityDot severity={r.severity} />
              <span>{r.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WinsCard({ wins }) {
  return (
    <Card title="Wins">
      {(!wins || wins.length === 0) ? (
        <Empty>No recent wins to highlight.</Empty>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
          {wins.map((w, i) => (
            <li key={i} style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
              ✓ {w.summary}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NudgesCard({ nudges }) {
  return (
    <Card title="Vector suggests">
      <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
        {nudges.map((n, i) => (
          <li key={i} style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, display: "flex", gap: 8 }}>
            <NudgeIcon kind={n.kind} />
            <span>{n.summary}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Card({ title, children }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", margin: 0 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{children}</p>;
}

function SeverityDot({ severity }) {
  const color =
    severity === "high" ? "var(--danger)" :
    severity === "medium" ? "var(--alert)" :
    "var(--text-muted)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 6, flexShrink: 0 }} />;
}

function TrendPill({ trend }) {
  const map = {
    improving: { label: "↗ improving", color: "var(--success, #5cd6a5)" },
    stable: { label: "→ stable", color: "var(--text-muted)" },
    declining: { label: "↘ declining", color: "var(--alert)" },
  };
  const m = map[trend] || map.stable;
  return (
    <span style={{ fontSize: 11, color: m.color, padding: "2px 6px", borderRadius: 4, border: `1px solid ${m.color}` }}>
      {m.label}
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--action)" }}>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" fill="currentColor" />
    </svg>
  );
}

function NudgeIcon({ kind }) {
  const map = {
    unassigned_task: "👤",
    follow_up: "✉️",
    stale_task: "⏳",
    customer_dark: "💤",
  };
  return <span aria-hidden style={{ flexShrink: 0 }}>{map[kind] || "•"}</span>;
}

// Crude best-effort extraction during streaming. JSON arrives as one block,
// so we just look for the first headline/tldr key. If we can't parse yet,
// we show the raw streaming text.
function extractHeadlineFromPartial(text) {
  const m = text.match(/"headline"\s*:\s*"([^"]*)/);
  return m ? m[1] : null;
}
function extractTldrFromPartial(text) {
  const m = text.match(/"tldr"\s*:\s*"([^"]*)/);
  return m ? m[1] : null;
}
