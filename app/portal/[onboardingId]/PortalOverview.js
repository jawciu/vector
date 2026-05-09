"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import InlineProse from "@/app/ui/InlineProse";
import {
  InsightCard,
  InsightCardHeader,
  InsightSection,
  InsightStatusPill,
  WinRow,
  ThisWeekRow,
  EmptyMessage,
} from "@/app/ui/InsightCard";
import TaskFilterMenu from "@/app/components/TaskFilterMenu";
import { taskMatchesFilter } from "@/lib/taskFilters";
import PortalTaskCard from "./PortalTaskCard";
import PortalUpdatesBanner from "./PortalUpdatesBanner";

const SOFT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const STATUS_TILE_COLORS = {
  done: "var(--success)",
  inProgress: "var(--action)",
  blocked: "var(--danger)",
  notStarted: "var(--text-muted)",
};

function formatGoLive(targetGoLive) {
  if (!targetGoLive) return null;
  const now = new Date();
  const goLive = new Date(targetGoLive);
  const days = Math.ceil((goLive - now) / (1000 * 60 * 60 * 24));
  const dateStr = goLive.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (days < 0) {
    return {
      label: `Go-live was ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`,
      detail: dateStr,
      color: "var(--danger)",
    };
  }
  if (days === 0) {
    return { label: "Go-live is today", detail: dateStr, color: "var(--alert)" };
  }
  return {
    label: `${days} day${days !== 1 ? "s" : ""} to go-live`,
    detail: dateStr,
    color: "var(--text)",
  };
}

/**
 * Deterministic header card. One pane card with go-live on the left, a
 * single-row task-summary breakdown on the right. Stacks on narrow widths.
 */
function SummaryHeaderCard({ data }) {
  const goLive = formatGoLive(data.targetGoLive);
  const summary = data.taskSummary;
  const items = [
    { label: "To do", count: summary.notStarted, color: STATUS_TILE_COLORS.notStarted },
    { label: "In progress", count: summary.inProgress, color: STATUS_TILE_COLORS.inProgress },
    { label: "Blocked", count: summary.blocked, color: STATUS_TILE_COLORS.blocked },
    { label: "Done", count: summary.done, color: STATUS_TILE_COLORS.done },
  ];

  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid var(--button-secondary-border)",
        background: "var(--bg)",
        padding: "16px 20px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      {goLive ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: goLive.color }}>
            {goLive.label}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{goLive.detail}</span>
        </div>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          {summary.total} task{summary.total === 1 ? "" : "s"}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        {items.map(({ label, count, color }, i) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <span style={{ fontWeight: 600, color }}>{count}</span>
            <span style={{ color: "var(--text-muted)" }}>{label}</span>
            {i < items.length - 1 && (
              <span aria-hidden style={{ color: "var(--border)", marginLeft: 10 }}>·</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Deterministic "Your tasks" section — replaces the old My Tasks tab. Same
 * filter dropdown the vendor side uses; always scoped to the current
 * portal contact (`isAssignedToMe`).
 */
function YourTasksSection({ tasks, onSessionExpired }) {
  const [filter, setFilter] = useState("active");
  const [localTasks, setLocalTasks] = useState(tasks);

  // Keep local state in sync if the parent re-fetches tasks (currently never,
  // but cheap insurance and lets task toggles stick on this surface).
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const myTasks = localTasks.filter((t) => t.isAssignedToMe);
  const filtered = myTasks
    .filter((t) => taskMatchesFilter(t, filter))
    .sort((a, b) => {
      const aDue = a.due ? new Date(a.due).getTime() : Infinity;
      const bDue = b.due ? new Date(b.due).getTime() : Infinity;
      return aDue - bDue;
    });

  function handleTaskUpdated(taskId, updatedTask) {
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updatedTask } : t))
    );
  }

  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid var(--button-secondary-border)",
        background: "var(--bg)",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
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
            Your tasks
          </span>
        </div>
        <TaskFilterMenu value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          {myTasks.length === 0
            ? "Your vendor hasn't assigned any tasks to you yet."
            : `No ${filter} tasks for you right now.`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((task) => (
            <PortalTaskCard
              key={task.id}
              task={task}
              onTaskUpdated={handleTaskUpdated}
              onSessionExpired={onSessionExpired}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalOverview({ data, tasks = [], snapshot, contextHash, cachedInsight }) {
  const router = useRouter();
  const handleSessionExpired = useCallback(() => {
    router.push("/portal/auth?error=expired");
  }, [router]);

  const [payload, setPayload] = useState(() =>
    isPortalShape(cachedInsight?.payload) ? cachedInsight.payload : null
  );
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState(() => initialStatus(cachedInsight, contextHash));
  const [error, setError] = useState(null);
  const triggeredRef = useRef(false);

  const regenerate = useCallback(async () => {
    if (triggeredRef.current) return;
    if (!snapshot || !contextHash) return;
    triggeredRef.current = true;
    setStatus("streaming");
    setStreamingText("");
    setError(null);

    let res;
    try {
      res = await fetch(`/api/insights/portal/${data.id}`, {
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
    triggeredRef.current = false;
  }, [snapshot, contextHash, data.id]);

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
  const aiStatus = payload?.status ?? null;
  const wins = payload?.wins ?? [];
  const focusThisWeek = payload?.focusThisWeek ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PortalUpdatesBanner />

      <SummaryHeaderCard data={data} />

      <InsightCard isStreaming={isStreaming}>
        <InsightCardHeader
          title={data.companyName}
          statusPill={aiStatus ? <InsightStatusPill status={aiStatus} audience="customer" /> : null}
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

        {/* Single grid: 3-up at >1100px, 2-up + full at >640px, stacked below */}
        <div className="oi-row oi-row--portal">
          <InsightSection title="Summary" className="oi-section oi-section--summary-portal">
            <div className="oi-section-body">
              <p style={{ fontSize: 14, lineHeight: "20px", color: "var(--text)", margin: 0 }}>
                <InlineProse text={summary} />
              </p>
            </div>
          </InsightSection>

          <InsightSection title="Wins" className="oi-section oi-section--wins-portal">
            <div className="oi-section-body">
              {wins.length === 0 ? (
                <EmptyMessage>{payload ? "No wins to celebrate this week." : "Generating…"}</EmptyMessage>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", flex: 1 }}>
                  {wins.slice(0, 2).map((w, i) => (
                    <WinRow
                      key={i}
                      headline={w.headline}
                      detail={w.detail}
                      position={
                        wins.length === 1 ? "only" : i === 0 ? "top" : "bottom"
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </InsightSection>

          <InsightSection title="Focus this week" className="oi-section oi-section--focus-portal">
            <div className="oi-section-body">
              {focusThisWeek.length === 0 ? (
                <EmptyMessage>{payload ? "Quiet week ahead." : "Generating…"}</EmptyMessage>
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

      <YourTasksSection tasks={tasks} onSessionExpired={handleSessionExpired} />
    </div>
  );
}

function initialStatus(cached, hash) {
  if (!cached || !isPortalShape(cached.payload)) return "needs-generate";
  if (cached.contextHash !== hash) return "stale";
  const age = Date.now() - new Date(cached.generatedAt).getTime();
  return age > SOFT_TTL_MS ? "stale" : "fresh";
}

function isPortalShape(p) {
  return Boolean(
    p &&
      typeof p.summary === "string" &&
      typeof p.status === "string" &&
      Array.isArray(p.wins) &&
      Array.isArray(p.focusThisWeek)
  );
}

function extractField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)`);
  const m = text.match(re);
  return m ? m[1] : null;
}
