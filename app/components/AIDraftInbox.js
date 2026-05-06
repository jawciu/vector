"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Tooltip from "@/app/ui/Tooltip";
import {
  DependenciesIcon,
  CalendarIcon,
  PriorityIcon,
  StatusIcon,
  OwnerIcon,
  AssigneeIcon,
} from "@/app/ui/Icons";
import { MenuList, MenuOption } from "./Menu";
import CalendarDropdown from "@/app/ui/CalendarDropdown";

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
export default function AIDraftInbox({
  initialDrafts,
  mode = "pending",
  query = "",
  vendorUsers = [],
  contacts = [],
  phases = [],
  openTasks = [],
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
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
          onToggleSelect={toggleSelected}
          onApprove={handleApprove}
          onReject={handleReject}
          onRejectGroup={(ids) => handleBulkReject(ids, "rejected from transcript group")}
          vendorUsers={vendorUsers}
          contacts={contacts}
          phases={phases}
          openTasks={openTasks}
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
  onToggleSelect,
  onApprove,
  onReject,
  onRejectGroup,
  vendorUsers,
  contacts,
  phases,
  openTasks,
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
        {group.drafts.map((draft) => {
          if (draft.action === "draft_followup") {
            return (
              <FollowupCard
                key={draft.id}
                draft={draft}
                mode={mode}
                busy={busyIds.has(draft.id)}
                error={errors[draft.id]}
                onApprove={(overrides) => onApprove(draft, overrides)}
                onReject={() => onReject(draft, null)}
              />
            );
          }
          if (draft.action === "create_task") {
            return (
              <CreateTaskCard
                key={draft.id}
                draft={draft}
                mode={mode}
                busy={busyIds.has(draft.id)}
                error={errors[draft.id]}
                onApprove={(overrides) => onApprove(draft, overrides)}
                onReject={() => onReject(draft, null)}
                vendorUsers={vendorUsers}
                contacts={contacts}
                phases={phases}
                openTasks={openTasks}
              />
            );
          }
          return (
            <DraftCard
              key={draft.id}
              draft={draft}
              mode={mode}
              busy={busyIds.has(draft.id)}
              error={errors[draft.id]}
              selected={selectedIds.has(draft.id)}
              onToggleSelect={() => onToggleSelect(draft.id)}
              onApprove={(overrides) => onApprove(draft, overrides)}
              onReject={() => onReject(draft, null)}
            />
          );
        })}
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
  onToggleSelect,
  onApprove,
  onReject,
}) {
  const { action, payload, sourceQuote, sourceUrl, confidence, onboardingId, onboardingName, source, status, rejectedReason, resolvedAt } = draft;
  const isPending = mode === "pending";
  const heading = describeAction(action, payload);
  const meta = describeMeta(action, payload);

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
          {meta && (
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

      {isPending && (
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

/**
 * Self-contained "Create task" draft card.
 *
 * Two visual states (controlled by local `mode`):
 *   - "compact" (default) — preview-style summary echoing a kanban TaskCard.
 *     Buttons: Dismiss · Edit task · Create task.
 *   - "edit" — full task form with pill triggers for due/priority/status,
 *     full-width selectors for owner/assignee/dependencies, and a notes
 *     textarea. Buttons: Dismiss · Save draft · Create task.
 *
 * Save draft semantics: PATCH the draft's payload, then return to compact.
 * Create task: approves the draft with the in-memory edits as overrides.
 * Dismiss: if there are unsaved edits, confirm before rejecting.
 */
function CreateTaskCard({
  draft,
  mode,
  busy,
  error,
  onApprove,
  onReject,
  vendorUsers = [],
  contacts = [],
  phases = [],
  openTasks = [],
}) {
  const isPending = mode === "pending";
  const original = useMemo(() => normaliseCreateTaskPayload(draft.payload), [draft.payload]);

  const [cardMode, setCardMode] = useState("compact");
  const [edits, setEdits] = useState(original);
  const [savedPayload, setSavedPayload] = useState(original);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Re-sync edits when the persisted draft.payload changes externally.
  useEffect(() => {
    const next = normaliseCreateTaskPayload(draft.payload);
    setSavedPayload(next);
    setEdits(next);
  }, [draft.payload]);

  const taskTitle = (cardMode === "edit" ? edits.title : savedPayload.title) || "Untitled task";
  const generatedDate = draft.createdAt
    ? new Date(draft.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  const dirty = !payloadsEqual(edits, savedPayload);

  function patchEdits(patch) {
    setEdits((prev) => ({ ...prev, ...patch }));
  }

  async function handleSaveDraft() {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/ai-drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: edits }),
      });
      if (!res.ok && res.status !== 204) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Save failed (${res.status})`);
      }
      setSavedPayload(edits);
      setCardMode("compact");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss() {
    if (dirty) {
      const ok = typeof window !== "undefined"
        ? window.confirm("Discard unsaved changes?")
        : true;
      if (!ok) return;
    }
    onReject();
  }

  function handleCreate() {
    // Pass current in-memory edits as overrides; backend will merge with
    // the persisted payload server-side.
    onApprove(cardMode === "edit" ? edits : savedPayload);
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
      <CreateTaskHeader draft={draft} taskTitle={taskTitle} generatedDate={generatedDate} isPending={isPending} />

      {cardMode === "edit" && (
        <div style={{ height: 1, background: "var(--border-subtle)", margin: "-16px 0" }} aria-hidden />
      )}

      {cardMode === "compact" ? (
        <CreateTaskPreview payload={savedPayload} />
      ) : (
        <CreateTaskEditForm
          edits={edits}
          onChange={patchEdits}
          vendorUsers={vendorUsers}
          contacts={contacts}
          phases={phases}
          openTasks={openTasks}
          disabled={busy || saving}
        />
      )}

      {(error || saveError) && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--danger)",
            background: "rgba(255, 137, 155, 0.1)",
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          {error || saveError}
        </div>
      )}

      {isPending && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy || saving}
            className="text-btn"
            style={{
              padding: "4px 8px",
              fontSize: 14,
              color: "var(--text)",
              opacity: busy || saving ? 0.5 : 1,
            }}
          >
            Dismiss
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {cardMode === "compact" ? (
              <button
                type="button"
                onClick={() => setCardMode("edit")}
                disabled={busy}
                className="btn-secondary text-sm rounded-lg"
                style={{ padding: "4px 10px", fontSize: 14 }}
              >
                Edit task
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={busy || saving || !dirty}
                className="btn-secondary text-sm rounded-lg"
                style={{ padding: "4px 10px", fontSize: 14, opacity: !dirty || saving ? 0.5 : 1 }}
              >
                {saving ? "…" : "Save draft"}
              </button>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || saving}
              className="btn-primary text-sm rounded-lg"
              style={{ padding: "4px 10px", fontSize: 14, fontWeight: 600, opacity: busy ? 0.5 : 1 }}
            >
              {busy ? "…" : "Create task"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Coerce a raw payload (which may include the legacy `owner: "vendor"|"customer"`
 *  string from older drafts) to the new shape. Any keys not provided default
 *  to safe values. */
function normaliseCreateTaskPayload(payload) {
  const p = payload ?? {};
  return {
    title: typeof p.title === "string" ? p.title : "",
    description: typeof p.description === "string" ? p.description : "",
    ownerId: Number.isInteger(p.ownerId) ? p.ownerId : null,
    assigneeContactId: Number.isInteger(p.assigneeContactId) ? p.assigneeContactId : null,
    dueDate: typeof p.dueDate === "string" ? p.dueDate : "",
    phaseId: Number.isInteger(p.phaseId) ? p.phaseId : null,
    priority: ["low", "medium", "high"].includes(p.priority) ? p.priority : "medium",
    blockedByTaskId: Number.isInteger(p.blockedByTaskId) ? p.blockedByTaskId : null,
    notes: typeof p.notes === "string" ? p.notes : "",
  };
}

function payloadsEqual(a, b) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.ownerId === b.ownerId &&
    a.assigneeContactId === b.assigneeContactId &&
    a.dueDate === b.dueDate &&
    a.phaseId === b.phaseId &&
    a.priority === b.priority &&
    a.blockedByTaskId === b.blockedByTaskId &&
    a.notes === b.notes
  );
}

/** Header — breadcrumb + meta rows (shared by compact and edit). */
function CreateTaskHeader({ draft, taskTitle, generatedDate, isPending }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TasksBreadcrumbIcon />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Create task</span>
        <ChevronRight />
        <span className="task-ref">{taskTitle}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 12 }}>
          <FollowupSparkleIcon />
          From miniti
        </span>
        {generatedDate && <MetaDot />}
        {generatedDate && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{generatedDate}</span>}
        <MetaDot />
        <ConfidencePill confidence={draft.confidence} />
        {!isPending && (
          <>
            <MetaDot />
            <StatusPill status={draft.status} />
          </>
        )}
      </div>
    </div>
  );
}

/** Compact preview — small task-card-style summary inside the outer
 *  bordered card. Visually echoes a kanban TaskCard but stripped down. */
function CreateTaskPreview({ payload }) {
  const due = payload.dueDate ? new Date(payload.dueDate) : null;
  const dueLabel = due
    ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const dueAgo = due ? formatDueAgo(due) : null;
  const noteCount = payload.notes && payload.notes.trim() ? 1 : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 8,
        background: "var(--bg-elevated)",
      }}
    >
      <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.4 }}>
        {payload.title || "Untitled task"}
      </div>
      {dueLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)" }}>
          <CalendarIcon />
          <span>{dueLabel}</span>
          {dueAgo && <span style={{ color: "var(--text-muted)" }}>· {dueAgo}</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          className="status-pill"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            padding: "2px 6px",
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          Not started
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Notes">
            <NotesIcon />
            {noteCount}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Comments">
            <CommentsIcon />
            0
          </span>
          <PriorityIcon priority={payload.priority} />
        </div>
      </div>
    </div>
  );
}

function formatDueAgo(date) {
  const now = new Date();
  const ms = date.getTime() - now.setHours(0, 0, 0, 0);
  const days = Math.round(ms / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  if (days > 1) return `in ${days} days`;
  if (days === -1) return "1 day ago";
  return `${Math.abs(days)} days ago`;
}

/** Edit form — title + description + 3-pill row + owner/assignee/deps/notes. */
function CreateTaskEditForm({
  edits,
  onChange,
  vendorUsers,
  contacts,
  phases,
  openTasks,
  disabled,
}) {
  const ownerName = vendorUsers.find((u) => u.id === edits.ownerId)?.name || null;
  const assigneeName = contacts.find((c) => c.id === edits.assigneeContactId)?.name || null;
  const blockedByTask = openTasks.find((t) => t.id === edits.blockedByTaskId) || null;
  const phaseName = phases.find((p) => p.id === edits.phaseId)?.name || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <input
        type="text"
        value={edits.title}
        onChange={(e) => onChange({ title: e.target.value })}
        disabled={disabled}
        placeholder="Task title"
        aria-label="Title"
        style={ghostTitleStyle}
      />
      <textarea
        value={edits.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={disabled}
        rows={3}
        placeholder="Description"
        aria-label="Description"
        style={ghostDescriptionStyle}
      />

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <DueDatePill
          value={edits.dueDate}
          onChange={(dueDate) => onChange({ dueDate })}
          disabled={disabled}
        />
        <PriorityPill
          value={edits.priority}
          onChange={(priority) => onChange({ priority })}
          disabled={disabled}
        />
        <StatusPillTrigger />
      </div>

      <SelectPill
        icon={<OwnerIcon />}
        label="Owner"
        valueLabel={ownerName}
        options={[
          { id: null, label: "None" },
          ...vendorUsers.map((u) => ({ id: u.id, label: u.name || u.email })),
        ]}
        selected={edits.ownerId}
        onSelect={(ownerId) => onChange({ ownerId })}
        disabled={disabled}
      />

      <SelectPill
        icon={<AssigneeIcon />}
        label="Assignee"
        valueLabel={assigneeName}
        options={[
          { id: null, label: "None" },
          ...contacts.map((c) => ({ id: c.id, label: c.name || c.email })),
        ]}
        selected={edits.assigneeContactId}
        onSelect={(assigneeContactId) => onChange({ assigneeContactId })}
        disabled={disabled}
      />

      <SelectPill
        icon={<DependenciesIcon />}
        label="Dependencies"
        valueLabel={blockedByTask?.title || null}
        options={[
          { id: null, label: "None" },
          ...openTasks.map((t) => ({ id: t.id, label: t.title })),
        ]}
        selected={edits.blockedByTaskId}
        onSelect={(blockedByTaskId) => onChange({ blockedByTaskId })}
        disabled={disabled}
      />

      {phases.length > 0 && (
        <SelectPill
          icon={<StatusIcon />}
          label="Phase"
          valueLabel={phaseName}
          options={phases.map((p) => ({ id: p.id, label: p.name }))}
          selected={edits.phaseId}
          onSelect={(phaseId) => onChange({ phaseId })}
          disabled={disabled}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotesIcon />
          <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Notes</span>
        </div>
        <textarea
          value={edits.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          disabled={disabled}
          placeholder="Verbatim notes from the source meeting (optional)"
          aria-label="Notes"
          style={{ ...ghostDescriptionStyle, height: 86, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

const ghostTitleStyle = {
  width: "100%",
  padding: "4px 0",
  fontSize: 16,
  background: "transparent",
  color: "var(--text)",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
};

const ghostDescriptionStyle = {
  width: "100%",
  padding: "4px 0",
  fontSize: 14,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  lineHeight: 1.5,
  resize: "vertical",
};

/** Field-pill trigger that opens a MenuList of options. Used for owner /
 *  assignee / dependencies / phase. */
function SelectPill({ icon, label, valueLabel, options, selected, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative" style={{ width: "100%" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="field-pill flex items-center gap-2 rounded-lg"
        data-active={open ? "true" : undefined}
        style={{
          width: "100%",
          border: "1px solid var(--button-secondary-border)",
          padding: "6px 10px",
          minHeight: 30,
          background: "var(--bg)",
          color: valueLabel ? "var(--text)" : "var(--text-muted)",
          fontSize: 14,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {icon}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {valueLabel || label}
        </span>
      </button>
      {open && (
        <MenuList style={{ width: "100%", maxHeight: 240, overflowY: "auto" }}>
          {options.length === 0 ? (
            <div style={{ padding: "4px 8px", fontSize: 12, color: "var(--text-muted)" }}>
              No options
            </div>
          ) : (
            options.map((opt) => (
              <MenuOption
                key={String(opt.id)}
                active={opt.id === selected}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
              >
                {opt.label}
              </MenuOption>
            ))
          )}
        </MenuList>
      )}
    </div>
  );
}

/** Due date pill — opens CalendarDropdown. */
function DueDatePill({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const ref = useRef(null);

  const label = value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div ref={ref} className="relative" style={{ flex: 1, minWidth: 140 }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="field-pill flex items-center gap-2 rounded-lg"
        data-active={open ? "true" : undefined}
        style={{
          width: "100%",
          border: "1px solid var(--button-secondary-border)",
          padding: "6px 10px",
          minHeight: 30,
          background: "var(--bg)",
          color: label ? "var(--text)" : "var(--text-muted)",
          fontSize: 14,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <CalendarIcon />
        <span style={{ flex: 1, textAlign: "left" }}>{label || "Target"}</span>
      </button>
      {open && (
        <CalendarDropdown
          value={value}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClear={() => {
            onChange("");
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** Priority pill — opens a small enum dropdown. */
function PriorityPill({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const labelMap = { low: "Low", medium: "Medium", high: "High" };
  const label = labelMap[value] || "Priority";

  return (
    <div ref={ref} className="relative" style={{ flex: 1, minWidth: 140 }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="field-pill flex items-center gap-2 rounded-lg"
        data-active={open ? "true" : undefined}
        style={{
          width: "100%",
          border: "1px solid var(--button-secondary-border)",
          padding: "6px 10px",
          minHeight: 30,
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 14,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <PriorityIcon priority={value} />
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      </button>
      {open && (
        <MenuList style={{ width: "100%" }}>
          {["low", "medium", "high"].map((p) => (
            <MenuOption
              key={p}
              active={p === value}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              {labelMap[p]}
            </MenuOption>
          ))}
        </MenuList>
      )}
    </div>
  );
}

/** Read-only status pill — drafts are always "Not started" until approved. */
function StatusPillTrigger() {
  return (
    <div
      className="field-pill flex items-center gap-2 rounded-lg"
      style={{
        flex: 1,
        minWidth: 140,
        border: "1px solid var(--button-secondary-border)",
        padding: "6px 10px",
        minHeight: 30,
        background: "var(--bg)",
        color: "var(--text-muted)",
        fontSize: 14,
        cursor: "default",
      }}
      title="Drafts are always Not started until approved"
    >
      <CheckCircleIcon />
      <span>Not started</span>
    </div>
  );
}

/** Tasks (checkmark-square) icon — for the "Create task" breadcrumb. */
function TasksBreadcrumbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "var(--text-secondary)", flexShrink: 0 }}>
      <g clipPath="url(#cta-tasks-clip)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2.625 11.8125C2.50897 11.8125 2.39769 11.7664 2.31564 11.6844C2.23359 11.6023 2.1875 11.491 2.1875 11.375V2.625C2.1875 2.50897 2.23359 2.39769 2.31564 2.31564C2.39769 2.23359 2.50897 2.1875 2.625 2.1875H10.7188C10.8928 2.1875 11.0597 2.11836 11.1828 1.99529C11.3059 1.87222 11.375 1.7053 11.375 1.53125C11.375 1.3572 11.3059 1.19028 11.1828 1.06721C11.0597 0.94414 10.8928 0.875 10.7188 0.875H2.625C2.16087 0.875 1.71575 1.05937 1.38756 1.38756C1.05937 1.71575 0.875 2.16087 0.875 2.625V11.375C0.875 11.8391 1.05937 12.2842 1.38756 12.6124C1.71575 12.9406 2.16087 13.125 2.625 13.125H11.375C11.8391 13.125 12.2842 12.9406 12.6124 12.6124C12.9406 12.2842 13.125 11.8391 13.125 11.375V8.53125C13.125 8.3572 13.0559 8.19028 12.9328 8.06721C12.8097 7.94414 12.6428 7.875 12.4688 7.875C12.2947 7.875 12.1278 7.94414 12.0047 8.06721C11.8816 8.19028 11.8125 8.3572 11.8125 8.53125V11.375C11.8125 11.491 11.7664 11.6023 11.6844 11.6844C11.6023 11.7664 11.491 11.8125 11.375 11.8125H2.625ZM13.8075 4.095C13.9234 3.9706 13.9865 3.80606 13.9835 3.63604C13.9805 3.46603 13.9117 3.30382 13.7914 3.18358C13.6712 3.06334 13.509 2.99447 13.339 2.99147C13.1689 2.98847 13.0044 3.05158 12.88 3.1675L8.01675 8.02988L6.37788 6.33588C6.31808 6.2734 6.24653 6.22335 6.16733 6.18862C6.08813 6.15388 6.00284 6.13515 5.91638 6.13349C5.82991 6.13182 5.74397 6.14727 5.66349 6.17893C5.58302 6.21059 5.50959 6.25785 5.44744 6.31798C5.38529 6.37812 5.33564 6.44994 5.30133 6.52933C5.26703 6.60872 5.24876 6.6941 5.24757 6.78058C5.24638 6.86705 5.26229 6.95291 5.29439 7.03321C5.3265 7.11351 5.37415 7.18668 5.43462 7.2485L7.53725 9.422C7.59775 9.48475 7.67014 9.53481 7.7502 9.56927C7.83026 9.60374 7.91638 9.62191 8.00354 9.62272C8.0907 9.62354 8.17714 9.60698 8.25783 9.57402C8.33852 9.54106 8.41184 9.49235 8.4735 9.43075L13.8075 4.095Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="cta-tasks-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "currentColor", flexShrink: 0 }}>
      <path d="M3 2.5h8M3 5h8M3 7.5h5M3 10h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function CommentsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "currentColor", flexShrink: 0 }}>
      <path d="M2 4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 12 4v4a1.5 1.5 0 0 1-1.5 1.5H6.5L4 12V9.5h-.5A1.5 1.5 0 0 1 2 8V4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4.5 7L6.25 8.75L9.5 5.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    // Legacy fallback path. New create_task drafts route through
    // CreateTaskCard (not DraftCard), so this only fires for old or
    // unhandled action types. payload.owner ("vendor"|"customer") was
    // dropped from the orchestrator schema in favour of payload.ownerId
    // / payload.assigneeContactId — no longer surfaced here.
    const parts = [];
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
