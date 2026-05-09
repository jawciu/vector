"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import InlineProse from "../ui/InlineProse";
import {
  InsightCard,
  InsightCardHeader,
  InsightSection,
  InsightStatusPill,
  RiskCard,
  WinRow,
  FocusTodayItem,
  ThisWeekRow,
  EmptyMessage,
  cardPosition,
} from "../ui/InsightCard";

const SOFT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * AI Insights panel — onboarding scope ("Overview" tab).
 *
 * Layout:
 *   Header        : ✨ COMPANY NAME + status pill + regen
 *   Top row       : Summary | Risks | Wins
 *   Bottom row    : Focus today (with task cards) | This week (priority chevrons)
 *
 * Visual primitives live in `app/ui/InsightCard.js` so the customer portal
 * can render the same language with a different layout.
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
      <InsightCard isStreaming={isStreaming}>
        <InsightCardHeader
          title={companyName}
          statusPill={portfolioStatus ? <InsightStatusPill status={portfolioStatus} /> : null}
          isStreaming={isStreaming}
          payload={payload}
          onRegenerate={regenerate}
        />

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

        <div className="oi-row oi-row--top">
          <InsightSection title="Summary" className="oi-section oi-section--summary">
            <div className="oi-section-body">
              <p style={{ fontSize: 14, lineHeight: "18px", color: "var(--text)", margin: 0 }}>
                <InlineProse text={summary} />
              </p>
            </div>
          </InsightSection>

          <InsightSection title="Risks" className="oi-section oi-section--risks">
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
          </InsightSection>

          <InsightSection title="Wins" className="oi-section oi-section--wins">
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
          </InsightSection>
        </div>

        <hr style={{ height: 1, width: "100%", border: 0, background: "var(--border-subtle)", margin: 0 }} />

        <div className="oi-row oi-row--bottom">
          <InsightSection title="Focus today" className="oi-section oi-section--focus">
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
          </InsightSection>

          <InsightSection title="This week" className="oi-section oi-section--week">
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
          </InsightSection>
        </div>
      </InsightCard>
    </div>
  );
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
