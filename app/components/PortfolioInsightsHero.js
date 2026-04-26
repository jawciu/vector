"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const SOFT_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Compact AI hero card on the onboardings home dashboard. Same SSE
 * streaming flow as InsightsPanel but with a tighter layout suited to
 * sitting above the onboardings table.
 *
 * Props:
 *   snapshot      — Layer 1 portfolio snapshot (built server-side)
 *   contextHash   — hash of the snapshot
 *   cachedInsight — { contextHash, payload, generatedAt } | null
 */
export default function PortfolioInsightsHero({ snapshot, contextHash, cachedInsight }) {
  const [payload, setPayload] = useState(cachedInsight?.payload ?? null);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState(() => {
    if (!cachedInsight) return "needs-generate";
    if (cachedInsight.contextHash !== contextHash) return "stale";
    const age = Date.now() - new Date(cachedInsight.generatedAt).getTime();
    return age > SOFT_TTL_MS ? "stale" : "fresh";
  });
  const [error, setError] = useState(null);
  const triggeredRef = useRef(false);

  const regenerate = useCallback(async () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    setStatus("streaming");
    setStreamingText("");
    setError(null);

    let res;
    try {
      res = await fetch(`/api/insights/portfolio/all`, {
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
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!raw.startsWith("data:")) continue;
          let event;
          try {
            event = JSON.parse(raw.slice(5).trim());
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
    if (persistData) {
      fetch("/api/insights/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(persistData),
      }).catch((err) => console.warn("[PortfolioInsightsHero] save failed", err));
    }
    triggeredRef.current = false;
  }, [snapshot, contextHash]);

  useEffect(() => {
    if (status === "needs-generate" || status === "stale") {
      regenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStreaming = status === "streaming";
  const showStreamingText = isStreaming && !payload;
  const headline = showStreamingText
    ? extractField(streamingText, "headline") || "Generating…"
    : payload?.headline || "—";
  const tldr = showStreamingText
    ? extractField(streamingText, "tldr") || ""
    : payload?.tldr || "";

  return (
    <div
      style={{
        margin: "12px 16px 0",
        padding: "16px 20px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <SparkleIcon />
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" }}>
              Vector — across all onboardings
            </span>
            {payload?.trend && <TrendPill trend={payload.trend} />}
            {isStreaming && payload && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                regenerating…
              </span>
            )}
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", margin: 0, lineHeight: 1.3 }}>
            {headline}
          </h2>
          {tldr && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
              {tldr}
            </p>
          )}
        </div>
        <button
          onClick={regenerate}
          disabled={isStreaming}
          className="btn-secondary text-sm rounded-lg"
          style={{
            padding: "4px 10px",
            opacity: isStreaming ? 0.5 : 1,
            cursor: isStreaming ? "default" : "pointer",
            flexShrink: 0,
            fontSize: 12,
          }}
        >
          {isStreaming ? "…" : "↻"}
        </button>
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

      {payload && (payload.focusToday?.length > 0 || payload.risks?.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            paddingTop: 4,
            borderTop: "1px solid var(--border-subtle)",
            marginTop: 4,
          }}
        >
          <FocusList items={payload.focusToday} />
          <RiskList risks={payload.risks} />
        </div>
      )}
    </div>
  );
}

function FocusList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", margin: "4px 0" }}>
        Focus today
      </h3>
      {(!items || items.length === 0) ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Nothing pressing.</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((item, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
              {item.onboardingId ? (
                <Link
                  href={`/onboardings/${item.onboardingId}`}
                  style={{ color: "var(--text)", textDecoration: "none" }}
                >
                  <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 10, marginRight: 6 }}>
                    #{item.onboardingId}
                  </span>
                  {item.reason}
                </Link>
              ) : (
                <span style={{ color: "var(--text)" }}>{item.reason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RiskList({ risks }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", margin: "4px 0" }}>
        Top risks
      </h3>
      {(!risks || risks.length === 0) ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>No active risks.</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
          {risks.slice(0, 3).map((r, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.5, display: "flex", gap: 6 }}>
              <SeverityDot severity={r.severity} />
              <span style={{ color: "var(--text)" }}>
                {r.onboardingId && (
                  <Link href={`/onboardings/${r.onboardingId}`} style={{ color: "var(--text-muted)", textDecoration: "none", fontFamily: "monospace", fontSize: 10, marginRight: 6 }}>
                    #{r.onboardingId}
                  </Link>
                )}
                {r.summary}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeverityDot({ severity }) {
  const color =
    severity === "high" ? "var(--danger)" :
    severity === "medium" ? "var(--alert)" :
    "var(--text-muted)";
  return <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, marginTop: 6, flexShrink: 0 }} />;
}

function TrendPill({ trend }) {
  const map = {
    improving: { label: "↗ improving", color: "var(--success, #5cd6a5)" },
    stable: { label: "→ stable", color: "var(--text-muted)" },
    declining: { label: "↘ declining", color: "var(--alert)" },
  };
  const m = map[trend] || map.stable;
  return (
    <span style={{ fontSize: 10, color: m.color, padding: "1px 5px", borderRadius: 4, border: `1px solid ${m.color}` }}>
      {m.label}
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ color: "var(--action)" }}>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" fill="currentColor" />
    </svg>
  );
}

function extractField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)`);
  const m = text.match(re);
  return m ? m[1] : null;
}
