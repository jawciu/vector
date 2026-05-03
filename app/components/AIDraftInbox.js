"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

/**
 * "Vector suggests" inbox — list of PendingAIChange rows.
 *
 * Props:
 *   initialDrafts — drafts at the chosen status
 *   mode — "pending" | "applied" | "rejected"
 *
 * Pending mode:
 *   - Per-card Approve / Edit / Reject buttons
 *   - Bulk-select checkbox per card; sticky "N selected" action bar with
 *     "Reject selected"
 *   - Per-transcript group: when 2+ drafts share a sourceEventId, a header
 *     with a "Reject all from this meeting" button
 *   - Edit-before-approve: inline form on create_task drafts (the most
 *     common kind); Approve uses the edited payload via the existing
 *     /api/ai-drafts/[id]/approve `overrides` body
 *
 * Applied / rejected modes:
 *   - Read-only — no checkboxes, no action buttons
 *   - Status-coloured pill on each card
 */
export default function AIDraftInbox({ initialDrafts, mode = "pending" }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);

  const isPending = mode === "pending";

  // Group drafts by sourceEventId so we can show a "reject all from meeting"
  // header when 2+ drafts came from the same Miniti transcript.
  const groups = useMemo(() => groupDraftsByEvent(drafts), [drafts]);

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleApprove(draft, overrides = {}) {
    setBusy(draft.id, true);
    setErrors((e) => ({ ...e, [draft.id]: null }));
    try {
      const res = await fetch(`/api/ai-drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Approve failed (${res.status})`);
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setEditingId((id) => (id === draft.id ? null : id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: err.message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function handleBulkReject(ids, reason = null) {
    // Sequential to keep error messages per-row; small N.
    for (const id of ids) {
      const draft = drafts.find((d) => d.id === id);
      if (!draft) continue;
       
      await handleReject(draft, reason);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
      {isPending && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onReject={() => handleBulkReject(Array.from(selectedIds), "bulk reject")}
          onClear={clearSelection}
        />
      )}

      {groups.map((group) => (
        <DraftGroup
          key={group.key}
          group={group}
          mode={mode}
          busyIds={busyIds}
          errors={errors}
          selectedIds={selectedIds}
          editingId={editingId}
          onToggleSelect={toggleSelected}
          onApprove={handleApprove}
          onReject={handleReject}
          onStartEdit={(id) => setEditingId(id)}
          onCancelEdit={() => setEditingId(null)}
          onRejectGroup={(ids) => handleBulkReject(ids, "rejected from transcript group")}
        />
      ))}
    </div>
  );
}

/** Group drafts by sourceEventId. Drafts without an event id form one
 *  group per draft (no grouping). */
function groupDraftsByEvent(drafts) {
  const byEvent = new Map();
  const singles = [];
  for (const d of drafts) {
    if (d.sourceEventId == null) {
      singles.push({ key: `single-${d.id}`, eventId: null, drafts: [d] });
      continue;
    }
    const list = byEvent.get(d.sourceEventId) ?? [];
    list.push(d);
    byEvent.set(d.sourceEventId, list);
  }
  const grouped = [];
  for (const [eventId, list] of byEvent.entries()) {
    grouped.push({ key: `event-${eventId}`, eventId, drafts: list });
  }
  // Render order: single drafts, then event groups (by event id desc for newest first).
  grouped.sort((a, b) => b.eventId - a.eventId);
  return [...singles, ...grouped];
}

function DraftGroup({
  group,
  mode,
  busyIds,
  errors,
  selectedIds,
  editingId,
  onToggleSelect,
  onApprove,
  onReject,
  onStartEdit,
  onCancelEdit,
  onRejectGroup,
}) {
  const isPending = mode === "pending";
  const showHeader = isPending && group.drafts.length > 1 && group.eventId != null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {showHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            background: "var(--bg)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span>
            {group.drafts.length} drafts from the same Miniti meeting
          </span>
          <button
            onClick={() => onRejectGroup(group.drafts.map((d) => d.id))}
            className="btn-secondary text-sm rounded-lg"
            style={{ padding: "2px 10px", fontSize: 11 }}
          >
            Reject all
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {group.drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            mode={mode}
            busy={busyIds.has(draft.id)}
            error={errors[draft.id]}
            selected={selectedIds.has(draft.id)}
            editing={editingId === draft.id}
            onToggleSelect={() => onToggleSelect(draft.id)}
            onApprove={(overrides) => onApprove(draft, overrides)}
            onReject={() => onReject(draft, null)}
            onStartEdit={() => onStartEdit(draft.id)}
            onCancelEdit={onCancelEdit}
          />
        ))}
      </div>
    </div>
  );
}

function BulkActionBar({ count, onReject, onClear }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text)" }}>
        <strong>{count}</strong> selected
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onClear}
          className="btn-secondary text-sm rounded-lg"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Clear
        </button>
        <button
          onClick={onReject}
          className="btn-secondary text-sm rounded-lg"
          style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)" }}
        >
          Reject selected
        </button>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  mode,
  busy,
  error,
  selected,
  editing,
  onToggleSelect,
  onApprove,
  onReject,
  onStartEdit,
  onCancelEdit,
}) {
  const { action, payload, sourceQuote, sourceUrl, confidence, onboardingId, onboardingName, source, status, rejectedReason, resolvedAt } = draft;
  const isPending = mode === "pending";
  const heading = describeAction(action, payload);
  const meta = describeMeta(action, payload);
  const canEdit = isPending && action === "create_task";
  const isFollowup = action === "draft_followup";

  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 10,
        background: "var(--surface)",
        border: `1px solid ${selected ? "var(--action)" : "var(--border)"}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {isPending && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            disabled={busy}
            aria-label="Select this draft"
            style={{ marginTop: 4, accentColor: "var(--action)" }}
          />
        )}
        <ActionIcon action={action} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, lineHeight: 1.4 }}>
            {heading}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Link href={`/onboardings/${onboardingId}`} style={{ color: "var(--text-muted)" }}>
              {onboardingName ?? `Onboarding #${onboardingId}`}
            </Link>
            <span>·</span>
            <span>From {source}</span>
            <span>·</span>
            <ConfidencePill confidence={confidence} />
            {!isPending && (
              <>
                <span>·</span>
                <StatusPill status={status} />
                {resolvedAt && (
                  <span style={{ color: "var(--text-muted)" }}>
                    {new Date(resolvedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </>
            )}
          </div>
          {meta && !editing && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {meta}
            </div>
          )}
          {!isPending && rejectedReason && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
              Reason: {rejectedReason}
            </div>
          )}
        </div>
      </div>

      {sourceQuote && !editing && (
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
          &ldquo;{sourceQuote}&rdquo;
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

      {editing && (
        <EditCreateTaskForm
          draft={draft}
          busy={busy}
          onCancel={onCancelEdit}
          onSave={(overrides) => onApprove(overrides)}
        />
      )}

      {isFollowup && <FollowupBody payload={payload} /> }

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

      {isPending && !editing && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onReject}
            disabled={busy}
            className="btn-secondary text-sm rounded-lg"
            style={{ padding: "4px 12px", opacity: busy ? 0.5 : 1, fontSize: 13 }}
          >
            Reject
          </button>
          {canEdit && (
            <button
              onClick={onStartEdit}
              disabled={busy}
              className="btn-secondary text-sm rounded-lg"
              style={{ padding: "4px 12px", opacity: busy ? 0.5 : 1, fontSize: 13 }}
            >
              Edit
            </button>
          )}
          {isFollowup && (
            <a
              href={buildMailto(payload)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-sm rounded-lg"
              style={{ padding: "4px 12px", fontSize: 13, textDecoration: "none" }}
            >
              Open in mail ↗
            </a>
          )}
          <button
            onClick={() => onApprove({})}
            disabled={busy}
            className="btn-primary text-sm rounded-lg"
            style={{ padding: "4px 14px", opacity: busy ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
          >
            {busy ? "…" : isFollowup ? "Mark sent" : "Approve →"}
          </button>
        </div>
      )}
    </div>
  );
}

function FollowupBody({ payload }) {
  const { subject, body, to, toName, fromName, fromEmail } = payload ?? {};
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        background: "var(--bg)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", gap: 12, color: "var(--text-muted)" }}>
        <span><strong style={{ color: "var(--text-secondary)" }}>From:</strong> {fromName ?? "(unknown)"}{fromEmail ? ` <${fromEmail}>` : ""}</span>
      </div>
      <div style={{ display: "flex", gap: 12, color: "var(--text-muted)" }}>
        <span><strong style={{ color: "var(--text-secondary)" }}>To:</strong> {toName ?? to ?? "(no contact email)"}{to && toName ? ` <${to}>` : ""}</span>
      </div>
      {subject && (
        <div style={{ color: "var(--text)", fontWeight: 500 }}>
          {subject}
        </div>
      )}
      {body && (
        <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {body}
        </div>
      )}
    </div>
  );
}

function buildMailto(payload) {
  const to = payload?.to ?? "";
  const subject = payload?.subject ?? "";
  const body = payload?.body ?? "";
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const qs = params.toString();
  return `mailto:${encodeURIComponent(to)}${qs ? `?${qs}` : ""}`;
}

function EditCreateTaskForm({ draft, busy, onCancel, onSave }) {
  const original = draft.payload ?? {};
  const [title, setTitle] = useState(original.title ?? "");
  const [description, setDescription] = useState(original.description ?? "");
  const [owner, setOwner] = useState(original.owner ?? "vendor");
  const [dueDate, setDueDate] = useState(original.dueDate ?? "");
  const [priority, setPriority] = useState(original.priority ?? "medium");

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ title, description, owner, dueDate, priority });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          required
          style={inputStyle}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={2}
          style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Owner">
          <select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={busy} style={inputStyle}>
            <option value="vendor">Vendor</option>
            <option value="customer">Customer</option>
          </select>
        </Field>
        <Field label="Due">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy} style={inputStyle}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-secondary text-sm rounded-lg"
          style={{ padding: "4px 12px", fontSize: 13 }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary text-sm rounded-lg"
          style={{ padding: "4px 14px", fontSize: 13, fontWeight: 600 }}
        >
          {busy ? "…" : "Approve with edits →"}
        </button>
      </div>
    </form>
  );
}

const inputStyle = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 13,
  background: "var(--bg-elevated)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  outline: "none",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
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
    case "draft_followup":
      return `Follow up on task #${payload.taskId}`;
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
  if (action === "draft_followup") {
    const parts = [];
    if (Array.isArray(payload.reasons) && payload.reasons.length) {
      parts.push(payload.reasons.join(" + "));
    }
    if (payload.tone) parts.push(`Tone: ${payload.tone}`);
    return parts.join(" · ") || null;
  }
  return null;
}

function ActionIcon({ action }) {
  const map = {
    create_task: "+",
    match_existing: "≡",
    update_status: "↻",
    draft_followup: "✉",
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

function StatusPill({ status }) {
  const map = {
    applied: { label: "applied", color: "var(--success, #5cd6a5)" },
    rejected: { label: "rejected", color: "var(--text-muted)" },
    pending: { label: "pending", color: "var(--alert)" },
  };
  const m = map[status] || map.pending;
  return (
    <span
      style={{
        fontSize: 10,
        color: m.color,
        padding: "1px 6px",
        borderRadius: 4,
        border: `1px solid ${m.color}`,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {m.label}
    </span>
  );
}
