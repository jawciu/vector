"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Tooltip from "@/app/ui/Tooltip";
import { DependenciesIcon } from "@/app/ui/Icons";

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
export default function AIDraftInbox({ initialDrafts, mode = "pending", query = "" }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function flashToast(message) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const isPending = mode === "pending";

  // Search across task title (linked or payload), follow-up subject,
  // create_task title, meeting title, and onboarding name. Plain
  // case-insensitive substring match — list is small.
  const filteredDrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter((d) => {
      const haystacks = [
        d.taskTitle,
        d.payload?.subject,
        d.payload?.title,
        d.meetingTitle,
        d.onboardingName,
      ];
      return haystacks.some((s) => typeof s === "string" && s.toLowerCase().includes(q));
    });
  }, [drafts, query]);

  // Group drafts by sourceEventId so we can show a "reject all from meeting"
  // header when 2+ drafts came from the same Miniti transcript.
  const groups = useMemo(() => groupDraftsByEvent(filteredDrafts), [filteredDrafts]);

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
      if (draft.action === "draft_followup") {
        flashToast("Sent — comment posted on task");
      }
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
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {isPending && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onReject={() => handleBulkReject(Array.from(selectedIds), "bulk reject")}
          onClear={clearSelection}
        />
      )}

      {filteredDrafts.length === 0 && drafts.length > 0 && (
        <div
          style={{
            padding: "24px 16px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          No drafts match &ldquo;{query}&rdquo;.
        </div>
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
        {group.drafts.map((draft) =>
          draft.action === "draft_followup" ? (
            <FollowupCard
              key={draft.id}
              draft={draft}
              mode={mode}
              busy={busyIds.has(draft.id)}
              error={errors[draft.id]}
              onApprove={(overrides) => onApprove(draft, overrides)}
              onReject={() => onReject(draft, null)}
            />
          ) : (
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
          )
        )}
      </div>
    </div>
  );
}

/** Transient confirmation banner — shown for ~4s after Send-to-portal. */
function Toast({ message, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 6,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--success, #5cd6a5)",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--text)",
        cursor: "pointer",
      }}
    >
      <span style={{ color: "var(--success, #5cd6a5)" }}>✓</span>
      <span>{message}</span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
        See <a href="/ai-drafts?status=applied" style={{ color: "var(--action)" }} onClick={(e) => e.stopPropagation()}>Applied</a>
      </span>
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
          <button
            onClick={() => onApprove({})}
            disabled={busy}
            className="btn-primary text-sm rounded-lg"
            style={{ padding: "4px 14px", opacity: busy ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
          >
            {busy ? "…" : "Approve →"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Self-contained follow-up draft card (Vector DS, Figma 133:21373).
 *
 * Replaces the older meta-header-plus-FollowupEditor split. Layout:
 *   - Header row: dependencies icon + "Follow up" + chevron + task title pill
 *   - Meta sub-row 1: ✨ "From vector" · createdAt · "Tone: …"
 *   - Meta sub-row 2: stale reason · confidence pill (tooltip "AI confidence")
 *                     · "From meeting: <title>" when applicable
 *   - Title input + Message textarea (with copy-icon button over the textarea)
 *   - Footer: Dismiss (left, text) · Open in mail (secondary) · Comment (primary)
 *
 * Same backend semantics as before — Dismiss = /reject, Comment = /approve
 * (publishes the message body as a portal Comment). Renaming UI only.
 */
function FollowupCard({ draft, mode, busy, error, onApprove, onReject }) {
  const isPending = mode === "pending";
  const initial = draft.payload ?? {};
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [saveError, setSaveError] = useState(null);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef(null);
  const lastSaved = useRef({ subject: initial.subject ?? "", body: initial.body ?? "" });

  // Debounced autosave (silent on success; surface errors only). Only runs
  // while the card is editable.
  useEffect(() => {
    if (!isPending) return;
    if (subject === lastSaved.current.subject && body === lastSaved.current.body) {
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ai-drafts/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: { subject, body } }),
        });
        if (!res.ok && res.status !== 204) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Autosave failed (${res.status})`);
        }
        lastSaved.current = { subject, body };
        setSaveError(null);
      } catch (err) {
        setSaveError(err.message);
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [subject, body, draft.id, isPending]);

  const mailto = buildMailto({ to: initial.to, subject, body });
  const canSend = !busy && subject.trim().length > 0;
  const taskLabel = draft.taskTitle ?? `Task #${initial.taskId ?? ""}`.trim();
  const generatedDate = draft.createdAt
    ? new Date(draft.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  // Copies only the body (per Caroline's UX call — subject lives in mail).
  async function handleCopyBody() {
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setSaveError("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 32,
        padding: 24,
        borderRadius: 20,
        border: "1px solid var(--button-secondary-border)",
        background: "var(--bg)",
      }}
    >
      {/* Header — breadcrumb + meta rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DependenciesIcon style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Follow up</span>
          <ChevronRight />
          {draft.onboardingId && taskLabel ? (
            <Link
              href={`/onboardings/${draft.onboardingId}`}
              style={{ textDecoration: "none" }}
            >
              <span className="task-ref">{taskLabel}</span>
            </Link>
          ) : (
            <span className="task-ref">{taskLabel}</span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 12 }}>
              <FollowupSparkleIcon />
              From vector
            </span>
            {generatedDate && <MetaDot />}
            {generatedDate && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{generatedDate}</span>}
            <MetaDot />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tone: {initial.tone ?? "friendly"}</span>
            {!isPending && (
              <>
                <MetaDot />
                <StatusPill status={draft.status} />
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {draft.sourceQuote && (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{draft.sourceQuote}</span>
            )}
            {draft.sourceQuote && <MetaDot />}
            <ConfidencePill confidence={draft.confidence} />
            {draft.meetingTitle && (
              <>
                <MetaDot />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  From meeting:{" "}
                  <span className="task-ref">{draft.meetingTitle}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Body — Title + Message */}
      {isPending ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FieldBlock label="Title">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              placeholder="Subject"
              aria-label="Title"
              style={followupInputStyle}
            />
          </FieldBlock>

          <FieldBlock
            label="Message"
            actions={
              <button
                type="button"
                onClick={handleCopyBody}
                disabled={!body.trim()}
                aria-label={copied ? "Copied" : "Copy message"}
                title={copied ? "Copied" : "Copy message"}
                className="icon-btn"
                style={{
                  padding: 0,
                  width: 16,
                  height: 16,
                  background: "none",
                  border: "none",
                  color: copied ? "var(--success)" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CopyIcon />
              </button>
            }
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
              rows={5}
              placeholder="Body"
              aria-label="Message"
              style={{ ...followupInputStyle, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" }}
            />
          </FieldBlock>

          {saveError && (
            <div role="alert" style={{ fontSize: 11, color: "var(--danger)" }}>
              Couldn&rsquo;t save: {saveError}
            </div>
          )}
        </div>
      ) : (
        <FollowupBodyReadonly payload={draft.payload} />
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

      {/* Action row */}
      {isPending && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={onReject}
            disabled={busy}
            className="text-btn"
            style={{
              padding: "4px 8px",
              fontSize: 14,
              color: "var(--text)",
              opacity: busy ? 0.5 : 1,
            }}
          >
            Dismiss
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={mailto}
              className="btn-secondary text-sm rounded-lg"
              style={{ padding: "4px 10px", fontSize: 14, textDecoration: "none" }}
            >
              Open in mail
            </a>
            <button
              onClick={() => onApprove({ subject, body })}
              disabled={!canSend}
              className="btn-primary text-sm rounded-lg"
              style={{
                padding: "4px 10px",
                fontSize: 14,
                fontWeight: 600,
                opacity: !canSend ? 0.5 : 1,
              }}
              title="Publishes the message body as a Comment visible in the customer portal."
            >
              {busy ? "…" : "Comment"}
            </button>
          </div>
        </div>
      )}

      {!isPending && draft.rejectedReason && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
          Reason: {draft.rejectedReason}
        </div>
      )}
    </div>
  );
}

const followupInputStyle = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--surface-hover)",
  borderRadius: 8,
  outline: "none",
};

function FieldBlock({ label, actions, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 4 }}>
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{label}</span>
        {actions}
      </div>
      {children}
    </div>
  );
}

function MetaDot() {
  return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>·</span>;
}

function ChevronRight() {
  return (
    <svg width="6" height="11" viewBox="0 0 6 11" fill="none" aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }}>
      <path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="3.5" width="8" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.5 10V2.5C2.5 1.67157 3.17157 1 4 1H9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function FollowupSparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <defs>
        <linearGradient id="aidraft-sparkle" x1="7" y1="-3" x2="7" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C098FF" />
          <stop offset="1" stopColor="#FF9C7D" />
        </linearGradient>
      </defs>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" fill="url(#aidraft-sparkle)" />
    </svg>
  );
}


/** Read-only render for applied/rejected follow-ups — shows what was sent. */
function FollowupBodyReadonly({ payload }) {
  const { subject, body, to, toName } = payload ?? {};
  const recipient = toName || to || null;
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
      {recipient && (
        <div style={{ color: "var(--text-muted)" }}>
          → To: <span style={{ color: "var(--text-secondary)" }}>{recipient}</span>
        </div>
      )}
      {subject && <div style={{ color: "var(--text)", fontWeight: 500 }}>{subject}</div>}
      {body && (
        <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {body}
        </div>
      )}
    </div>
  );
}

/** Build a mailto: URL. The recipient address goes in unencoded (per RFC
 *  6068 — percent-encoding the address breaks some clients including
 *  Thunderbird and addresses with `+` aliases). Subject/body params ARE
 *  encoded via URLSearchParams. */
function buildMailto({ to, subject, body }) {
  const recipient = to ?? "";
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const qs = params.toString();
  return `mailto:${recipient}${qs ? `?${qs}` : ""}`;
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
    <Tooltip label="AI confidence">
      <span style={{ color: m.color, fontFamily: "monospace", cursor: "default" }}>
        {m.dots} {confidence}
      </span>
    </Tooltip>
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
