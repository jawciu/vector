"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import CompanyAvatar from "@/app/ui/CompanyAvatar";

const SOFT_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * AI hero card on the onboardings home dashboard.
 *
 * Layout: PORTFOLIO TODAY header + status pill, then three columns
 * (Summary / Risk focus or Focus this week / Wins) separated by AI-gradient
 * dividers. Streams via SSE through /api/insights/portfolio/all.
 */
export default function PortfolioInsightsHero({ snapshot, contextHash, cachedInsight }) {
  const companyById = useMemo(() => {
    const m = new Map();
    for (const o of snapshot?.onboardings ?? []) m.set(o.id, o.company);
    return m;
  }, [snapshot]);

  const [payload, setPayload] = useState(() =>
    isNewShape(cachedInsight?.payload) ? cachedInsight.payload : null
  );
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState(() => {
    if (!cachedInsight || !isNewShape(cachedInsight.payload)) return "needs-generate";
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
  const summary = showStreamingText
    ? extractField(streamingText, "summary") || "Generating…"
    : payload?.summary || "—";
  const portfolioStatus = payload?.status ?? null;
  const priorityMode = payload?.priority?.mode ?? null;
  const priorityItems = payload?.priority?.items ?? [];
  const wins = payload?.wins ?? [];
  const priorityHeading = priorityMode === "focus" ? "Focus this week" : "Risk focus";

  return (
    <div
      style={{
        margin: "12px 16px 0",
        borderRadius: 20,
        border: "1px solid var(--button-secondary-border)",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SparkleIcon />
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.6px",
                textTransform: "uppercase",
                color: "var(--text)",
                lineHeight: "16.5px",
              }}
            >
              Portfolio today
            </span>
          </div>
          {portfolioStatus && <StatusPill status={portfolioStatus} />}
          {isStreaming && payload && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              regenerating…
            </span>
          )}
        </div>
        <button
          onClick={regenerate}
          disabled={isStreaming}
          aria-label="Regenerate"
          className="btn-secondary text-sm rounded-lg"
          style={{
            padding: "4px 10px",
            opacity: isStreaming ? 0.5 : 1,
            cursor: isStreaming ? "default" : "pointer",
            fontSize: 12,
          }}
        >
          {isStreaming ? "…" : "↻"}
        </button>
      </div>

      <hr className="ai-divider" />

      {error && (
        <div
          style={{
            margin: 16,
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

      {/* Body — three columns */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 16, padding: "0 16px" }}>
        <Section title="Summary" style={{ flex: "0 0 288px", paddingTop: 16, paddingBottom: 16 }}>
          <p style={{ fontSize: 14, lineHeight: "18px", color: "var(--text)", margin: 0 }}>
            {summary}
          </p>
        </Section>

        <VerticalDivider />

        <Section title={priorityHeading} style={{ flex: 1, padding: "16px 0" }}>
          {priorityItems.length === 0 ? (
            <EmptyMessage>{payload ? "Nothing flagged right now." : "Generating…"}</EmptyMessage>
          ) : (
            <div style={{ display: "flex", gap: 0, borderRadius: 12, overflow: "hidden" }}>
              {priorityItems.slice(0, 3).map((item, i) => (
                <PriorityCard
                  key={item.onboardingId}
                  onboardingId={item.onboardingId}
                  company={companyById.get(item.onboardingId) ?? `Onboarding #${item.onboardingId}`}
                  issues={item.issues ?? []}
                  position={cardPosition(i, priorityItems.length)}
                />
              ))}
            </div>
          )}
        </Section>

        {wins.length > 0 && (
          <>
            <VerticalDivider />
            <Section title="Wins" style={{ flex: 1, padding: "16px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden" }}>
                {wins.slice(0, 2).map((w, i) => (
                  <WinRow
                    key={`${w.onboardingId}-${i}`}
                    company={companyById.get(w.onboardingId) ?? w.headline}
                    detail={w.detail}
                    position={i === 0 ? "top" : "bottom"}
                    isLast={i === wins.length - 1}
                  />
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, style, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch", ...style }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.5px",
            color: "var(--text-muted)",
            lineHeight: "16.5px",
          }}
        >
          {title}
        </span>
        <hr className="ai-divider" />
      </div>
      {children}
    </div>
  );
}

function VerticalDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 1,
        alignSelf: "stretch",
        background: "var(--ai-gradient)",
        flexShrink: 0,
      }}
    />
  );
}

function PriorityCard({ onboardingId, company, issues, position }) {
  const radius = {
    left: { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
    middle: {},
    right: { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
    only: { borderRadius: 12 },
  }[position];

  return (
    <Link
      href={`/onboardings/${onboardingId}`}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border)",
        marginRight: position === "right" || position === "only" ? 0 : -1,
        ...radius,
      }}
      className="priority-card"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
        <CompanyAvatar name={company} size={16} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: "20px" }}>
          {company}
        </span>
      </div>
      <div style={{ padding: "4px 12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: "18px" }}>Issues</span>
        <div style={{ fontSize: 14, color: "var(--text)", lineHeight: "18px" }}>
          {issues.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    </Link>
  );
}

function WinRow({ company, detail, position }) {
  const radius =
    position === "top"
      ? { borderTopLeftRadius: 12, borderTopRightRadius: 12 }
      : { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 };
  const borderTop = position === "top" ? "1px solid var(--border)" : "none";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 12px",
        borderTop,
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        ...radius,
      }}
    >
      <div style={{ paddingTop: 2 }}>
        <CompanyAvatar name={company} size={16} />
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: "20px", color: "var(--text)" }}>
        {company}{" "}
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{detail}</span>
      </p>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    Declining: "var(--danger)",
    "At risk": "var(--alert)",
    "On track": "var(--success)",
    Improving: "var(--mint)",
  };
  const bg = map[status] ?? "var(--text-muted)";
  return (
    <span className="status-pill status-pill--filled" style={{ background: bg }}>
      {status}
    </span>
  );
}

function EmptyMessage({ children }) {
  return (
    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{children}</p>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <defs>
        {/* Hex stops mirror DESIGN.md aiGradientFrom/aiGradientTo. SVG <stop>
            doesn't reliably resolve CSS custom properties across all browsers,
            so the values are inlined here. Update both if the tokens change. */}
        <linearGradient id="vector-sparkle-gradient" x1="0" y1="0" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C098FF" />
          <stop offset="1" stopColor="#FF9C7D" />
        </linearGradient>
      </defs>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" fill="url(#vector-sparkle-gradient)" />
    </svg>
  );
}

function cardPosition(index, total) {
  if (total === 1) return "only";
  if (index === 0) return "left";
  if (index === total - 1) return "right";
  return "middle";
}

function isNewShape(p) {
  return Boolean(p && typeof p.summary === "string" && p.priority && Array.isArray(p.priority.items));
}

function extractField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)`);
  const m = text.match(re);
  return m ? m[1] : null;
}
