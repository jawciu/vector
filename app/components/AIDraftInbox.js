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
import Sparkle from "@/app/ui/Sparkle";
import TaskIdChip from "@/app/ui/TaskIdChip";
import MeetingDrawer from "./MeetingDrawer";

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
  const [drawerEventId, setDrawerEventId] = useState(null);
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
    // Hide retired draft types — `comment_only` was removed from the
    // orchestrator schema, but legacy rows linger in the DB.
    const live = drafts.filter(
      (d) => !(d.action === "match_existing" && d.payload?.action === "comment_only")
    );
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter((d) => {
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

  // Two-column timeline split:
  //   - Follow-ups column: `draft_followup`, meeting-agnostic, just date sections
  //   - Actions column: everything else, date sections with meeting groups inside
  const followupBuckets = useMemo(
    () => buildDateBuckets(filteredDrafts.filter((d) => d.action === "draft_followup")),
    [filteredDrafts]
  );
  const actionBuckets = useMemo(
    () => buildDateBuckets(filteredDrafts.filter((d) => d.action !== "draft_followup")),
    [filteredDrafts]
  );

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
    <div style={{ display: "flex", flexDirection: "column", gap: 32, position: "relative" }}>
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

      <div className="actions-grid">
        <DraftColumn
          title="Follow-ups"
          buckets={followupBuckets}
          variant="followup"
          mode={mode}
          busyIds={busyIds}
          errors={errors}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
          onApprove={handleApprove}
          onReject={handleReject}
          vendorUsers={vendorUsers}
          contacts={contacts}
          phases={phases}
          openTasks={openTasks}
          onMeetingClick={setDrawerEventId}
        />
        <DraftColumn
          title="Actions"
          buckets={actionBuckets}
          variant="action"
          mode={mode}
          busyIds={busyIds}
          errors={errors}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
          onApprove={handleApprove}
          onReject={handleReject}
          vendorUsers={vendorUsers}
          contacts={contacts}
          phases={phases}
          openTasks={openTasks}
          onMeetingClick={setDrawerEventId}
        />
      </div>

      <MeetingDrawer
        eventId={drawerEventId}
        onClose={() => setDrawerEventId(null)}
      />
    </div>
  );
}

/** Bucket a draft's createdAt into Today / Yesterday / older (YYYY-MM-DD). */
function getDateBucket(iso) {
  if (!iso) return "older";
  const date = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "yesterday";
  return startOfDate.toISOString().slice(0, 10);
}

function bucketLabel(bucket) {
  if (bucket === "today") return "Today";
  if (bucket === "yesterday") return "Yesterday";
  if (bucket === "older") return "Older";
  return new Date(bucket).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function bucketSortKey(bucket) {
  if (bucket === "today") return Number.MAX_SAFE_INTEGER;
  if (bucket === "yesterday") return Number.MAX_SAFE_INTEGER - 1;
  if (bucket === "older") return Number.MIN_SAFE_INTEGER;
  return new Date(bucket).getTime();
}

/** Group a flat draft list into [{ bucket, drafts }] sorted newest-first. */
function buildDateBuckets(drafts) {
  const buckets = new Map();
  for (const d of drafts) {
    const bucket = getDateBucket(d.createdAt);
    const list = buckets.get(bucket) ?? [];
    list.push(d);
    buckets.set(bucket, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => bucketSortKey(b[0]) - bucketSortKey(a[0]))
    .map(([bucket, drafts]) => ({ bucket, drafts }));
}

/** Within a date bucket, split action drafts into per-meeting groups
 *  (drafts with sourceEventId) and a "no meeting" tail. */
function groupBucketByMeeting(drafts) {
  const byEvent = new Map();
  const looseDrafts = [];
  for (const d of drafts) {
    if (d.sourceEventId == null) {
      looseDrafts.push(d);
      continue;
    }
    const list = byEvent.get(d.sourceEventId) ?? [];
    list.push(d);
    byEvent.set(d.sourceEventId, list);
  }
  const meetingGroups = [...byEvent.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([eventId, drafts]) => ({ eventId, drafts }));
  return { meetingGroups, looseDrafts };
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

/** One column of the two-column timeline.
 *
 *  Renders date sections (Today / Yesterday / DD MMM) stacked vertically.
 *  - variant="followup": drafts (FollowupCard) listed directly under each
 *    date label — no meeting grouping (follow-ups are meeting-agnostic).
 *  - variant="action": each date section further groups drafts by
 *    sourceEventId, with a `MeetingPill` above each group; loose drafts
 *    (no sourceEventId, e.g. stale-task scanner) appear below the groups.
 */
function DraftColumn({
  title,
  buckets,
  variant,
  mode,
  busyIds,
  errors,
  selectedIds,
  onToggleSelect,
  onApprove,
  onReject,
  vendorUsers,
  contacts,
  phases,
  openTasks,
  onMeetingClick,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {title}
      </h2>
      {buckets.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Nothing here.</p>
      )}
      {buckets.map(({ bucket, drafts }) => (
        <section key={bucket} style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <h3 className="actions-date-header">{bucketLabel(bucket)}</h3>
          {variant === "followup"
            ? drafts.map((draft) => (
                <FollowupCard
                  key={draft.id}
                  draft={draft}
                  mode={mode}
                  busy={busyIds.has(draft.id)}
                  error={errors[draft.id]}
                  onApprove={(overrides) => onApprove(draft, overrides)}
                  onReject={() => onReject(draft, null)}
                  onMeetingClick={onMeetingClick}
                />
              ))
            : (() => {
                const { meetingGroups, looseDrafts } = groupBucketByMeeting(drafts);
                return (
                  <>
                    {meetingGroups.map((group, idx) => {
                      const meetingTitle =
                        group.drafts.find((d) => d.meetingTitle)?.meetingTitle ?? "Meeting";
                      return (
                        <div
                          key={group.eventId}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 24,
                            marginTop: idx === 0 ? 0 : 24,
                          }}
                        >
                          <MeetingPill title={meetingTitle} onClick={() => onMeetingClick?.(group.eventId)} />
                          {group.drafts.map((draft) =>
                            renderActionCard(draft, {
                              mode,
                              busyIds,
                              errors,
                              selectedIds,
                              onToggleSelect,
                              onApprove,
                              onReject,
                              vendorUsers,
                              contacts,
                              phases,
                              openTasks,
                              onMeetingClick,
                            })
                          )}
                        </div>
                      );
                    })}
                    {looseDrafts.map((draft) =>
                      renderActionCard(draft, {
                        mode,
                        busyIds,
                        errors,
                        selectedIds,
                        onToggleSelect,
                        onApprove,
                        onReject,
                        vendorUsers,
                        contacts,
                        phases,
                        openTasks,
                        onMeetingClick,
                      })
                    )}
                  </>
                );
              })()}
        </section>
      ))}
    </div>
  );
}

/** Meeting separator — `📅 From <title>` row with an AI-gradient hairline
 *  divider underneath. The code-block background hugs only the title.
 *  Clicking the row opens the MeetingDrawer. */
function MeetingPill({ title, onClick }) {
  return (
    <div className="meeting-separator">
      <button
        type="button"
        onClick={onClick}
        className="meeting-separator__row"
        title="Open meeting transcript"
      >
        <span className="meeting-separator__icon">
          <CalendarIcon />
        </span>
        <span>From</span>
        <span className="meeting-separator__title">{title}</span>
      </button>
      <hr className="meeting-separator__divider" />
    </div>
  );
}

/** Pick the right card component for an action-column draft. */
function renderActionCard(draft, ctx) {
  if (draft.action === "create_task") {
    return (
      <CreateTaskCard
        key={draft.id}
        draft={draft}
        mode={ctx.mode}
        busy={ctx.busyIds.has(draft.id)}
        error={ctx.errors[draft.id]}
        selected={ctx.selectedIds.has(draft.id)}
        onToggleSelect={() => ctx.onToggleSelect(draft.id)}
        onApprove={(overrides) => ctx.onApprove(draft, overrides)}
        onReject={() => ctx.onReject(draft, null)}
        vendorUsers={ctx.vendorUsers}
        contacts={ctx.contacts}
        phases={ctx.phases}
        openTasks={ctx.openTasks}
        onMeetingClick={ctx.onMeetingClick}
      />
    );
  }
  return (
    <DraftCard
      key={draft.id}
      draft={draft}
      mode={ctx.mode}
      busy={ctx.busyIds.has(draft.id)}
      error={ctx.errors[draft.id]}
      selected={ctx.selectedIds.has(draft.id)}
      onToggleSelect={() => ctx.onToggleSelect(draft.id)}
      onApprove={(overrides) => ctx.onApprove(draft, overrides)}
      onReject={() => ctx.onReject(draft, null)}
      openTasks={ctx.openTasks}
      vendorUsers={ctx.vendorUsers}
      contacts={ctx.contacts}
    />
  );
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
  vendorUsers,
  contacts,
  phases,
  openTasks,
  onMeetingClick,
}) {
  // Show a "From meeting: <title>" header above any group whose drafts
  // came from a Miniti event. Click the title pill to open the
  // MeetingDrawer with the full transcript.
  const meetingTitle = group.eventId != null
    ? group.drafts.find((d) => d.meetingTitle)?.meetingTitle ?? null
    : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {meetingTitle && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-muted)" }}>From meeting:</span>
            <button
              type="button"
              onClick={() => onMeetingClick?.(group.eventId)}
              className="task-ref"
              style={{ border: "none", cursor: "pointer" }}
              title="Open meeting transcript"
            >
              {meetingTitle}
            </button>
          </div>
          <hr className="ai-divider" style={{ margin: 0 }} />
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
                onMeetingClick={onMeetingClick}
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
                onMeetingClick={onMeetingClick}
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

export function DraftCard({
  draft,
  mode,
  busy,
  error,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  openTasks = [],
  vendorUsers = [],
  contacts = [],
}) {
  const { action, payload, confidence, source, status, rejectedReason } = draft;
  const isPending = mode === "pending";
  const verb = describeActionVerb(action, payload);
  const taskTitle = lookupTaskTitle(openTasks, payload?.taskId) ?? `Task #${payload?.taskId ?? ""}`;
  const matchedTask = openTasks.find((t) => Number(t.id) === Number(payload?.taskId));

  // Edit-before-approve. Local overrides start blank; when the user opens
  // the editor each variant pre-fills from `payload`. Approve passes the
  // overrides object through to /approve so the backend merges them.
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState({});
  const editable = isEditableAction(action, payload);

  function openEdit() {
    setOverrides(initialOverridesFor(action, payload));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setOverrides({});
  }

  function patchOverrides(patch) {
    setOverrides((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div
      className="draft-card"
      style={{
        padding: 24,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        outline: selected ? "2px solid var(--action)" : "none",
      }}
    >
      <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isPending && (
              <SelectCheckbox selected={selected} onToggle={onToggleSelect} disabled={busy} />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ActionIcon action={action} payload={payload} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>{verb}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {matchedTask && <TaskIdChip task={matchedTask} />}
            <span className="task-ref" style={{ fontSize: 14, padding: "4px 10px", borderRadius: 6 }}>
              {taskTitle}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
              <FollowupSparkleIcon />
              From {source}
            </span>
            <MetaDot />
            <ConfidencePill confidence={confidence} />
            {!isPending && (
              <>
                <MetaDot />
                <StatusPill status={status} />
              </>
            )}
          </div>
          {!isPending && rejectedReason && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              Reason: {rejectedReason}
            </div>
          )}
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          {editing ? (
            <DraftEditPanel
              action={action}
              payload={payload}
              overrides={overrides}
              onChange={patchOverrides}
              disabled={busy}
              vendorUsers={vendorUsers}
              contacts={contacts}
            />
          ) : (
            <DraftCardTaskPreview task={matchedTask} fallbackTitle={taskTitle} />
          )}
        </div>
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

      {isPending && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={editing ? cancelEdit : onReject}
            disabled={busy}
            className="text-btn"
            style={{ padding: "4px 8px", fontSize: 14, color: "var(--text)", opacity: busy ? 0.5 : 1 }}
          >
            {editing ? "Cancel" : "Dismiss"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {editable && !editing && (
              <button
                type="button"
                onClick={openEdit}
                disabled={busy}
                className="btn-secondary text-sm rounded-lg"
                style={{ padding: "4px 10px", fontSize: 14, opacity: busy ? 0.5 : 1 }}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onApprove(editing ? overrides : {});
                if (editing) setEditing(false);
              }}
              disabled={busy || selected}
              aria-disabled={busy || selected}
              aria-label={selected ? "Unselect to approve individually" : undefined}
              title={selected ? "Unselect to approve individually" : undefined}
              className="btn-primary text-sm rounded-lg"
              style={{ padding: "4px 14px", fontSize: 14, fontWeight: 600, opacity: busy || selected ? 0.5 : 1 }}
            >
              {busy ? "…" : "Approve"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether the given draft has a known edit-before-approve form.
 *  Defer reassign (no payload override field) and comment_only (filtered
 *  out as retired). */
function isEditableAction(action, payload) {
  if (action === "update_status") return true;
  if (action === "match_existing") {
    const sub = payload?.action;
    return sub === "update_due_date" || sub === "reprioritise" || sub === "reassign";
  }
  return false;
}

/** Pre-fill the overrides object from the draft's payload so the editor
 *  opens with the AI's suggestion as the starting point. */
function initialOverridesFor(action, payload) {
  if (action === "update_status") {
    return { newStatus: payload?.newStatus ?? "Not started" };
  }
  if (action === "match_existing") {
    const sub = payload?.action;
    if (sub === "update_due_date") return { newDueDate: payload?.newDueDate ?? "" };
    if (sub === "reprioritise") return { newPriority: payload?.newPriority ?? "medium" };
    // Vector doesn't supply a target owner for reassigns — Caroline picks one.
    // Start with NO keys so an un-touched field is never sent: the backend
    // only patches owner/assignee for keys actually present in overrides, so
    // editing just the owner won't clobber an existing assignee (and vice
    // versa). Explicitly choosing "None" sets the key to null on purpose.
    if (sub === "reassign") return {};
  }
  return {};
}

/** Inline editor for a DraftCard. Replaces the right-column preview while
 *  the user is editing. Sub-action-aware. */
function DraftEditPanel({ action, payload, overrides, onChange, disabled, vendorUsers = [], contacts = [] }) {
  return (
    <div
      className="draft-card-preview"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 8,
      }}
    >
      {action === "update_status" && (
        <StatusOverrideEditor
          value={overrides.newStatus}
          onChange={(newStatus) => onChange({ newStatus })}
          disabled={disabled}
        />
      )}
      {action === "match_existing" && payload?.action === "update_due_date" && (
        <DueDateOverrideEditor
          value={overrides.newDueDate}
          onChange={(newDueDate) => onChange({ newDueDate })}
          disabled={disabled}
        />
      )}
      {action === "match_existing" && payload?.action === "reprioritise" && (
        <PriorityOverrideEditor
          value={overrides.newPriority}
          onChange={(newPriority) => onChange({ newPriority })}
          disabled={disabled}
        />
      )}
      {action === "match_existing" && payload?.action === "reassign" && (
        <ReassignOverrideEditor
          ownerId={overrides.newOwnerId}
          assigneeContactId={overrides.newAssigneeContactId}
          onChangeOwner={(newOwnerId) => onChange({ newOwnerId })}
          onChangeAssignee={(newAssigneeContactId) => onChange({ newAssigneeContactId })}
          vendorUsers={vendorUsers}
          contacts={contacts}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/** Reassign editor: pick a new owner (vendor) and/or assignee (contact).
 *  Vector flags the reassignment but never the target, so both start unset
 *  and are populated entirely by Caroline's selection. Reuses SelectPill. */
function ReassignOverrideEditor({
  ownerId,
  assigneeContactId,
  onChangeOwner,
  onChangeAssignee,
  vendorUsers,
  contacts,
  disabled,
}) {
  const ownerName = vendorUsers.find((u) => u.id === ownerId)?.name || null;
  const assigneeName = contacts.find((c) => c.id === assigneeContactId)?.name || null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SelectPill
        icon={<OwnerIcon />}
        label="Owner"
        valueLabel={ownerName}
        options={[
          { id: null, label: "None" },
          ...vendorUsers.map((u) => ({ id: u.id, label: u.name || u.email })),
        ]}
        selected={ownerId}
        onSelect={onChangeOwner}
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
        selected={assigneeContactId}
        onSelect={onChangeAssignee}
        disabled={disabled}
      />
    </div>
  );
}

function StatusOverrideEditor({ value, onChange, disabled }) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>New status</span>
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
            color: "var(--text)",
            fontSize: 14,
            textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <span style={{ flex: 1, textAlign: "left" }}>{value || "Pick status"}</span>
        </button>
        {open && (
          <MenuList style={{ width: "100%" }}>
            {TASK_STATUS_OPTIONS.map((s) => (
              <MenuOption
                key={s}
                active={s === value}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </MenuOption>
            ))}
          </MenuList>
        )}
      </div>
    </div>
  );
}

function DueDateOverrideEditor({ value, onChange, disabled }) {
  // Normalise the payload value (which may be a full ISO timestamp) down
  // to a YYYY-MM-DD string so the native date input renders it.
  const dateOnly = typeof value === "string" ? value.slice(0, 10) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>New due date</span>
      <input
        type="date"
        value={dateOnly}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="New due date"
        style={{
          width: "100%",
          padding: "6px 10px",
          fontSize: 14,
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--button-secondary-border)",
          borderRadius: 8,
          outline: "none",
          minHeight: 30,
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function PriorityOverrideEditor({ value, onChange, disabled }) {
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>New priority</span>
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
            color: "var(--text)",
            fontSize: 14,
            textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <PriorityIcon priority={value} />
          <span style={{ flex: 1, textAlign: "left" }}>{labelMap[value] || "Pick priority"}</span>
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
    </div>
  );
}

const TASK_STATUS_OPTIONS = ["Not started", "In progress", "Under investigation", "Blocked", "Done"];

/** Verb-only label for an action draft — kept short so the left column
 *  stays compact. Full payload details live on the right (task preview). */
function describeActionVerb(action, payload) {
  if (action === "match_existing") {
    const sub = payload?.action;
    if (sub === "reassign") return "Reassign";
    if (sub === "reprioritise") return "Re-prioritise";
    if (sub === "update_due_date") return "Update due date";
    return "Update task";
  }
  if (action === "update_status") return `Mark as ${payload?.newStatus ?? "—"}`;
  if (action === "draft_followup") return "Follow up";
  if (action === "create_task") return "Create task";
  return action;
}

function lookupTaskTitle(openTasks, taskId) {
  if (taskId == null) return null;
  const t = openTasks.find((x) => Number(x.id) === Number(taskId));
  return t?.title ?? null;
}

/** Right-column preview for an existing-task draft. Renders a compact
 *  task summary using the data we have (looked up from `openTasks`).
 *  Falls back to a title-only stub if the task isn't in the list. */
function DraftCardTaskPreview({ task, fallbackTitle }) {
  const due = task?.due ? new Date(task.due) : null;
  const dueLabel = due
    ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <div
      className="draft-card-preview"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
        {task && <TaskIdChip task={task} />}
        {task?.title ?? fallbackTitle}
      </div>
      {dueLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <CalendarIcon />
          <span>{dueLabel}</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          className="status-pill"
          style={{
            border: "1px solid var(--border-subtle)",
            padding: "2px 6px",
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          {task?.status ?? "Not started"}
        </span>
        {task?.priority && (
          <PriorityIcon priority={task.priority} />
        )}
      </div>
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
export function FollowupCard({ draft, mode, busy, error, onApprove, onReject, onMeetingClick }) {
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
      className="draft-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 24,
        borderRadius: 20,
      }}
    >
      {/* Header — icon + label / task pill / single meta row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DependenciesIcon style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>Follow up</span>
        </div>
        <div>
          {draft.onboardingId && taskLabel ? (
            <Link href={`/onboardings/${draft.onboardingId}`} style={{ textDecoration: "none" }}>
              <span className="task-ref" style={{ fontSize: 14, padding: "4px 10px", borderRadius: 6 }}>
                {taskLabel}
              </span>
            </Link>
          ) : (
            <span className="task-ref" style={{ fontSize: 14, padding: "4px 10px", borderRadius: 6 }}>
              {taskLabel}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
            <FollowupSparkleIcon />
            From vector
          </span>
          {draft.sourceQuote && (
            <>
              <MetaDot />
              <span style={{ color: "var(--text-secondary)" }}>{draft.sourceQuote}</span>
            </>
          )}
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

export function MetaDot() {
  return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>·</span>;
}

export function ChevronRight() {
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

export function FollowupSparkleIcon() {
  return <Sparkle size={14} />;
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
export function CreateTaskCard({
  draft,
  mode,
  busy,
  error,
  selected = false,
  onToggleSelect,
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

  function handleDismissOrExitEdit() {
    // In edit mode, the left button reads "Exit edit" and just collapses
    // back to compact (with dirty-confirm). In compact mode it's the
    // actual Dismiss → reject the draft.
    if (cardMode === "edit") {
      if (dirty) {
        const ok = typeof window !== "undefined"
          ? window.confirm("Discard unsaved changes?")
          : true;
        if (!ok) return;
        setEdits(savedPayload);
      }
      setCardMode("compact");
      return;
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
      className="draft-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 24,
        borderRadius: 20,
        outline: selected ? "2px solid var(--action)" : "none",
      }}
    >
      {cardMode === "compact" ? (
        <CreateTaskCompact
          draft={draft}
          taskTitle={taskTitle}
          payload={savedPayload}
          isPending={isPending}
          selected={selected}
          onToggleSelect={onToggleSelect}
          busy={busy}
        />
      ) : (
        <CreateTaskHeader draft={draft} taskTitle={taskTitle} generatedDate={generatedDate} isPending={isPending} />
      )}

      {cardMode === "edit" && (
        <div style={{ height: 1, background: "var(--border-subtle)", margin: "-12px 0" }} aria-hidden />
      )}

      {cardMode === "compact" ? null : (
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
            onClick={handleDismissOrExitEdit}
            disabled={busy || saving}
            className="text-btn"
            style={{
              padding: "4px 8px",
              fontSize: 14,
              color: "var(--text)",
              opacity: busy || saving ? 0.5 : 1,
            }}
          >
            {cardMode === "edit" ? "Exit edit" : "Dismiss"}
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
              disabled={busy || saving || selected}
              aria-disabled={busy || saving || selected}
              aria-label={selected ? "Unselect to approve individually" : undefined}
              title={selected ? "Unselect to approve individually" : undefined}
              className="btn-primary text-sm rounded-lg"
              style={{ padding: "4px 10px", fontSize: 14, fontWeight: 600, opacity: busy || selected ? 0.5 : 1 }}
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
/** Two-column compact view per Figma 140:9165.
 *  Left: heading (✓ Create task) + task-name code block + meta (✨ miniti · confidence).
 *  Right: task-card-style preview, lightens on outer-card hover. */
function CreateTaskCompact({ draft, taskTitle, payload, isPending, selected, onToggleSelect, busy }) {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isPending && onToggleSelect && (
            <SelectCheckbox selected={!!selected} onToggle={onToggleSelect} disabled={busy} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TasksBreadcrumbIcon />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>Create task</span>
          </div>
        </div>
        <div>
          <span className="task-ref" style={{ fontSize: 14, padding: "4px 10px", borderRadius: 6 }}>
            {taskTitle}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
            <FollowupSparkleIcon />
            From miniti
          </span>
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
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <CreateTaskPreview payload={payload} />
      </div>
    </div>
  );
}

function CreateTaskHeader({ draft, taskTitle, generatedDate, isPending }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TasksBreadcrumbIcon />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>Create task</span>
        <ChevronRight />
        <span className="task-ref">{taskTitle}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 12 }}>
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
      className="draft-card-preview"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
        {payload.title || "Untitled task"}
      </div>
      {dueLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <CalendarIcon />
          <span>{dueLabel}</span>
          {dueAgo && <span>· {dueAgo}</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          className="status-pill"
          style={{
            border: "1px solid var(--border-subtle)",
            padding: "2px 6px",
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          Not started
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
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
      <div className="field-row rounded-lg" style={{ padding: "6px 10px" }}>
        <input
          type="text"
          value={edits.title}
          onChange={(e) => onChange({ title: e.target.value })}
          disabled={disabled}
          placeholder="Task title"
          aria-label="Title"
          style={ghostTitleStyle}
        />
      </div>
      <div className="field-row rounded-lg" style={{ padding: "6px 10px" }}>
        <textarea
          value={edits.description}
          onChange={(e) => onChange({ description: e.target.value })}
          disabled={disabled}
          rows={3}
          placeholder="Description"
          aria-label="Description"
          style={ghostDescriptionStyle}
        />
      </div>

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
        <div className="field-row rounded-lg" style={{ padding: "6px 10px" }}>
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
    </div>
  );
}

const ghostTitleStyle = {
  width: "100%",
  padding: 0,
  fontSize: 16,
  background: "transparent",
  color: "var(--text)",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
};

const ghostDescriptionStyle = {
  width: "100%",
  padding: 0,
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "currentColor", flexShrink: 0 }}>
      <g clipPath="url(#aidraft-notes-clip)">
        <path d="M3.45675 3.89835H8.94754M3.45675 7.26357H10.6029M3.45675 10.494H7.72288M11.8948 2.83855L9.9266 0.85352C9.8046 0.731724 9.6598 0.635161 9.50047 0.56935C9.34114 0.503539 9.1704 0.46977 8.99801 0.469972H2.43732C2.26179 0.474361 2.09493 0.547188 1.97235 0.672907C1.84978 0.798626 1.7812 0.967278 1.78125 1.14286V12.9521C1.7812 13.1277 1.84978 13.2963 1.97235 13.4221C2.09493 13.5478 2.26179 13.6206 2.43732 13.625H11.6223C11.8007 13.625 11.9719 13.5541 12.0981 13.4279C12.2243 13.3017 12.2952 13.1306 12.2952 12.9521V3.76714C12.2932 3.59357 12.2568 3.42212 12.188 3.26273C12.1193 3.10333 12.0196 2.95915 11.8948 2.83855Z" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="aidraft-notes-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
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

/** Inline SVG action icon, 14×14, no background, `var(--icon-tertiary)`.
 *  For `match_existing`, branches on `payload.action` so the icon matches
 *  the sub-action. For `create_task`, uses the same "not done" circle+check
 *  shape as the Kanban CheckboxButton so the card reads as an unfinished
 *  task. */
function ActionIcon({ action, payload }) {
  let icon;
  if (action === "create_task") {
    icon = <NotDoneCheckIcon />;
  } else if (action === "match_existing") {
    const sub = payload?.action;
    if (sub === "update_due_date") icon = <ActionCalendarIcon />;
    else if (sub === "reassign") icon = <ActionPersonIcon />;
    else if (sub === "reprioritise") icon = <ActionFlagIcon />;
    else if (sub === "comment_only") icon = <ActionCommentIcon />;
    else icon = <ActionGridIcon />;
  } else if (action === "update_status") {
    icon = <ActionCycleIcon />;
  } else if (action === "draft_followup") {
    icon = <ActionEnvelopeIcon />;
  } else {
    icon = <ActionGridIcon />;
  }
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        // Match the create-task breadcrumb icon (TasksBreadcrumbIcon) so all
        // draft-card action icons read at the same colour + size.
        color: "var(--text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </span>
  );
}

/** Bulk-selection toggle, mirroring the Kanban board's CheckboxButton
 *  (TaskCardView): empty circle + ghost check when unselected whose
 *  outline animates to colour on hover, and a filled circle-check when
 *  selected. Uses --action (not --success) since this is a selection
 *  affordance in the inbox, not a "done" state. */
function SelectCheckbox({ selected, onToggle, disabled }) {
  const [hovered, setHovered] = useState(false);
  const strokeColor = hovered && !disabled ? "var(--action)" : "var(--icon-tertiary)";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? "Unselect this draft" : "Select this draft"}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      className="flex-shrink-0"
      style={{
        background: "none",
        border: "none",
        padding: "4px",
        margin: "-4px",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
      }}
    >
      {selected ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
            fill="var(--action)"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
          <circle
            cx="7"
            cy="7"
            r="6.5"
            stroke={strokeColor}
            style={{ transition: "stroke 0.15s ease" }}
          />
          <path
            d="M3.5 7L6.5 9.5L10.5 4.5"
            stroke={strokeColor}
            strokeLinecap="round"
            style={{ transition: "stroke 0.15s ease" }}
          />
        </svg>
      )}
    </button>
  );
}

/** Same "not done" circle+ghost-check as TaskCardView CheckboxButton.
 *  Used by ActionIcon's create_task fallback branch. */
function NotDoneCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
      <path d="M3.5 7L6.5 9.5L10.5 4.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function ActionCalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="3" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 6h10" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 1.5v2M9 1.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ActionPersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.5 12.25c.6-2.1 2.4-3.25 4.5-3.25s3.9 1.15 4.5 3.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ActionFlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 1.5v11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M3.5 2h7l-1.5 2.25L10.5 6.5h-7" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function ActionCommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 12 4v4a1.5 1.5 0 0 1-1.5 1.5H6.5L4 12V9.5h-.5A1.5 1.5 0 0 1 2 8V4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function ActionGridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="2" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8" y="2" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="2" y="8" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8" y="8" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function ActionCycleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7a4.5 4.5 0 0 1 7.7-3.2L12 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2v3.5h-3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 7a4.5 4.5 0 0 1-7.7 3.2L2 8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12V8.5h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActionEnvelopeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="11" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 4l5 4 5-4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
