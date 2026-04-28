"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * "Vector suggests" inbox — list of pending PendingAIChange rows.
 * Each card shows the action, the source quote, and approve/reject buttons.
 */
export default function AIDraftInbox({ initialDrafts }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleApprove(draft) {
    setBusy(draft.id, true);
    setErrors((e) => ({ ...e, [draft.id]: null }));
    try {
      const res = await fetch(`/api/ai-drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Approve failed (${res.status})`);
      }
      // Remove from list
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: err.message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function handleReject(draft, reason = null) {
    setBusy(draft.id, true);
    setErrors((e) => ({ ...e, [draft.id]: null }));
    try {
      const res = await fetch(`/api/ai-drafts/${draft.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Reject failed (${res.status})`);
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: err.message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          busy={busyIds.has(draft.id)}
          error={errors[draft.id]}
          onApprove={() => handleApprove(draft)}
          onReject={() => handleReject(draft, null)}
        />
      ))}
    </div>
  );
}

function DraftCard({ draft, busy, error, onApprove, onReject }) {
  const { action, payload, sourceQuote, sourceUrl, confidence, onboardingId, onboardingName, source } = draft;
  const heading = describeAction(action, payload);
  const meta = describeMeta(action, payload);

  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ActionIcon action={action} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, lineHeight: 1.4 }}>
            {heading}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/onboardings/${onboardingId}`} style={{ color: "var(--text-muted)" }}>
              {onboardingName ?? `Onboarding #${onboardingId}`}
            </Link>
            <span>·</span>
            <span>From {source}</span>
            <span>·</span>
            <ConfidencePill confidence={confidence} />
          </div>
          {meta && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {meta}
            </div>
          )}
        </div>
      </div>

      {sourceQuote && (
        <blockquote
          style={{
            margin: 0,
            padding: "8px 12px",
            borderLeft: "2px solid var(--border)",
            background: "var(--bg)",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          “{sourceQuote}”
          {sourceUrl && (
            <>
              {" "}
              <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--action)", fontStyle: "normal" }}>
                ↗
              </a>
            </>
          )}
        </blockquote>
      )}

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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onReject}
          disabled={busy}
          className="btn-secondary text-sm rounded-lg"
          style={{ padding: "4px 12px", opacity: busy ? 0.5 : 1, fontSize: 13 }}
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          className="btn-primary text-sm rounded-lg"
          style={{ padding: "4px 14px", opacity: busy ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
        >
          {busy ? "…" : "Approve →"}
        </button>
      </div>
    </div>
  );
}

function describeAction(action, payload) {
  switch (action) {
    case "create_task":
      return `Create task: "${payload.title ?? "(untitled)"}"`;
    case "match_existing": {
      const sub = payload.action;
      if (sub === "comment_only") return `Add comment to task #${payload.taskId}`;
      if (sub === "reassign") return `Reassign task #${payload.taskId}`;
      if (sub === "reprioritise") return `Re-prioritise task #${payload.taskId} → ${payload.newPriority}`;
      if (sub === "update_due_date") return `Update due date on task #${payload.taskId} → ${payload.newDueDate}`;
      return `Update task #${payload.taskId}`;
    }
    case "update_status":
      return `Mark task #${payload.taskId} as ${payload.newStatus}`;
    default:
      return action;
  }
}

function describeMeta(action, payload) {
  if (action === "create_task") {
    const parts = [];
    if (payload.owner) parts.push(`Owner: ${payload.owner}`);
    if (payload.dueDate) parts.push(`Due: ${payload.dueDate}`);
    if (payload.priority) parts.push(`Priority: ${payload.priority}`);
    return parts.join(" · ") || null;
  }
  return null;
}

function ActionIcon({ action }) {
  const map = {
    create_task: "+",
    match_existing: "≡",
    update_status: "↻",
  };
  const symbol = map[action] || "•";
  return (
    <span
      aria-hidden
      style={{
        width: 24,
        height: 24,
        flexShrink: 0,
        borderRadius: 6,
        background: "var(--bg-elevated)",
        color: "var(--action)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {symbol}
    </span>
  );
}

function ConfidencePill({ confidence }) {
  const map = {
    high: { dots: "●●●", color: "var(--success, #5cd6a5)" },
    medium: { dots: "●●○", color: "var(--text-secondary)" },
    low: { dots: "●○○", color: "var(--text-muted)" },
  };
  const m = map[confidence] || map.medium;
  return (
    <span style={{ color: m.color, fontFamily: "monospace" }}>
      {m.dots} {confidence}
    </span>
  );
}
