"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import TaskCardView from "./TaskCardView";
import { PriorityIcon } from "../ui/Icons";

const SOFT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * AI Insights panel — onboarding scope ("Overview" tab).
 *
 * Layout (matches Vector DS, Figma node 129:20374):
 *   Header        : ✨ COMPANY NAME + status pill
 *   Top row       : Summary | Risks | Wins
 *   Bottom row    : Focus today (with task cards) | This week (with priority chevrons)
 *
 * Uses TaskCardView (extracted from kanban TaskCard) for the Focus today
 * cards so the visual matches the kanban exactly without dragging the
 * sortable wiring along.
 *
 * Props:
 *   scope         — "onboarding"
 *   scopeId       — onboarding id (string-coerced)
 *   snapshot      — Layer 1 deterministic snapshot
 *   contextHash   — hash of the snapshot
 *   cachedInsight — { contextHash, payload, generatedAt } | null
 *   companyName   — display name for the header
 *   tasks         — the same task list rendered on the kanban; used to look up Focus today taskIds
 *   onTaskClick   — opens the task drawer (same handler the kanban uses)
 */
export default function InsightsPanel({
  scope = "onboarding",
  scopeId,
  snapshot,
  contextHash,
  cachedInsight,
  companyName = "Overview",
  tasks = [],
  onTaskClick,
}) {
  const taskById = useMemo(() => {
    const m = new Map();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const [payload, setPayload] = useState(() =>
    isNewShape(cachedInsight?.payload) ? cachedInsight.payload : null
  );
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState(() => initialStatus(cachedInsight, contextHash));
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
      }).catch((err) => console.warn("[InsightsPanel] save failed", err));
    }
    triggeredRef.current = false;
  }, [scope, scopeId, snapshot, contextHash]);

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
  const risks = payload?.risks ?? [];
  const wins = payload?.wins ?? [];
  const focusToday = payload?.focusToday ?? [];
  const focusThisWeek = payload?.focusThisWeek ?? [];

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
      <div
        className="oi-card"
        style={{
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
                {companyName}
              </span>
            </div>
            {portfolioStatus && <StatusPill status={portfolioStatus} />}
            {isStreaming && payload && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>regenerating…</span>
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

        <hr style={{ height: 1, width: "100%", border: 0, background: "var(--border-subtle)", margin: 0 }} />

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

        {/* Top row: Summary | Risks | Wins */}
        <div className="oi-row oi-row--top">
          <Section title="Summary" className="oi-section oi-section--summary">
            <div className="oi-section-body">
              <p style={{ fontSize: 14, lineHeight: "18px", color: "var(--text)", margin: 0 }}>{summary}</p>
            </div>
          </Section>

          <Section title="Risks" className="oi-section oi-section--risks">
            <div className="oi-section-body">
              {risks.length === 0 ? (
                <EmptyMessage>{payload ? "No active risks." : "Generating…"}</EmptyMessage>
              ) : (
                <div style={{ display: "flex", gap: 0, borderRadius: 12, overflow: "hidden", flex: 1, alignItems: "stretch" }}>
                  {risks.slice(0, 3).map((r, i) => (
                    <RiskCard
                      key={i}
                      severity={r.severity}
                      summary={r.summary}
                      position={cardPosition(i, Math.min(risks.length, 3))}
                    />
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Wins" className="oi-section oi-section--wins">
            <div className="oi-section-body">
              {wins.length === 0 ? (
                <EmptyMessage>{payload ? "No wins this week — keep going." : "Generating…"}</EmptyMessage>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", flex: 1 }}>
                  {wins.slice(0, 2).map((w, i) => (
                    <WinRow
                      key={i}
                      headline={w.headline}
                      detail={w.detail}
                      position={i === 0 ? "top" : "bottom"}
                    />
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>

        <hr style={{ height: 1, width: "100%", border: 0, background: "var(--border-subtle)", margin: 0 }} />

        {/* Bottom row: Focus today | This week */}
        <div className="oi-row oi-row--bottom">
          <Section title="Focus today" className="oi-section oi-section--focus">
            <div className="oi-section-body">
              {focusToday.length === 0 ? (
                <EmptyMessage>{payload ? "Nothing pressing today." : "Generating…"}</EmptyMessage>
              ) : (
                <div style={{ display: "flex", gap: 24, flex: 1, alignItems: "stretch", flexWrap: "wrap" }}>
                  {focusToday.slice(0, 3).map((item, i) => (
                    <FocusTodayItem
                      key={item.taskId}
                      index={i + 1}
                      reason={item.reason}
                      task={taskById.get(item.taskId)}
                      onTaskClick={onTaskClick}
                    />
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="This week" className="oi-section oi-section--week">
            <div className="oi-section-body">
              {focusThisWeek.length === 0 ? (
                <EmptyMessage>{payload ? "Nothing strategic queued." : "Generating…"}</EmptyMessage>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", flex: 1 }}>
                  {focusThisWeek.slice(0, 3).map((item, i) => (
                    <ThisWeekRow
                      key={i}
                      summary={item.summary}
                      priority={item.priority}
                      position={
                        focusThisWeek.length === 1
                          ? "only"
                          : i === 0
                          ? "top"
                          : i === Math.min(focusThisWeek.length, 3) - 1
                          ? "bottom"
                          : "middle"
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, className, children }) {
  return (
    <div className={className}>
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

function RiskCard({ severity, summary, position }) {
  const radius = {
    left:   { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
    middle: {},
    right:  { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
    only:   { borderRadius: 12 },
  }[position];

  const sevColor =
    severity === "high" ? "var(--danger)" :
    severity === "medium" ? "var(--alert)" :
    "var(--text-muted)";
  const sevLabel =
    severity === "high" ? "High" :
    severity === "medium" ? "Medium" :
    "Low";

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 180,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border)",
        marginRight: position === "right" || position === "only" ? 0 : -1,
        ...radius,
      }}
    >
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <span
          className="status-pill"
          style={{ color: sevColor, fontSize: 12 }}
        >
          {sevLabel}
        </span>
      </div>
      <div style={{ padding: "8px 12px 16px" }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "18px", color: "var(--text)" }}>{summary}</p>
      </div>
    </div>
  );
}

function WinRow({ headline, detail, position }) {
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
        flex: "1 1 0",
        borderTop,
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        ...radius,
      }}
    >
      <CheckCircle />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: "20px", color: "var(--text)" }}>
        {headline}{" "}
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{detail}</span>
      </p>
    </div>
  );
}

function FocusTodayItem({ index, reason, task, onTaskClick }) {
  return (
    <div style={{ flex: "1 1 240px", minWidth: 240, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "0 8px" }}>
        <span style={{ fontSize: 20, color: "var(--text)", lineHeight: 1, flexShrink: 0 }}>#{index}</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "18px", color: "var(--text)" }}>{reason}</p>
      </div>
      {task ? (
        <TaskCardView task={task} onCardClick={onTaskClick} />
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            border: "1px dashed var(--border)",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          Task unavailable
        </div>
      )}
    </div>
  );
}

function ThisWeekRow({ summary, priority, position }) {
  const radius = {
    only:   { borderRadius: 12 },
    top:    { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
    middle: {},
    bottom: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  }[position];
  const borderTop = position === "top" || position === "only" ? "1px solid var(--border)" : "none";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "12px",
        borderTop,
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        ...radius,
      }}
    >
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <PriorityIcon priority={priority} size={16} />
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: "20px", color: "var(--text)" }}>
        {summary}
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

function CheckCircle() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ marginTop: 2, flexShrink: 0 }}
    >
      <path
        d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
        fill="var(--success)"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="oi-sparkle-gradient" x1="7" y1="-3" x2="7" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C098FF" />
          <stop offset="1" stopColor="#FF9C7D" />
        </linearGradient>
      </defs>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" fill="url(#oi-sparkle-gradient)" />
    </svg>
  );
}

function EmptyMessage({ children }) {
  return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{children}</p>;
}

function cardPosition(index, total) {
  if (total === 1) return "only";
  if (index === 0) return "left";
  if (index === total - 1) return "right";
  return "middle";
}

function initialStatus(cached, hash) {
  if (!cached || !isNewShape(cached.payload)) return "needs-generate";
  if (cached.contextHash !== hash) return "stale";
  const age = Date.now() - new Date(cached.generatedAt).getTime();
  return age > SOFT_TTL_MS ? "stale" : "fresh";
}

function isNewShape(p) {
  return Boolean(
    p &&
      typeof p.summary === "string" &&
      Array.isArray(p.risks) &&
      Array.isArray(p.wins) &&
      Array.isArray(p.focusToday) &&
      Array.isArray(p.focusThisWeek)
  );
}

function extractField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)`);
  const m = text.match(re);
  return m ? m[1] : null;
}
