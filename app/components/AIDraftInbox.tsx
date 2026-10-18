"use client";

import { useState, useMemo, useEffect, useRef, useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ToastStack, useToasts } from "@/app/ui/Toast";
import Tooltip from "@/app/ui/Tooltip";
import {
  CopyIcon,
  DependenciesIcon,
  CalendarIcon,
  PriorityIcon,
  StatusIcon,
  OwnerIcon,
  AssigneeIcon,
} from "@/app/ui/Icons";
import type { TaskPriority } from "@/app/ui/Icons";
import { MenuList, MenuOption } from "./Menu";
import CalendarDropdown from "@/app/ui/CalendarDropdown";
import Sparkle from "@/app/ui/Sparkle";
import TaskIdChip from "@/app/ui/TaskIdChip";
import MeetingDrawer from "./MeetingDrawer";
import { ActionIcon } from "./DraftActionIcon";
import { TASK_STATUSES, STATUS_COLORS } from "@/lib/constants";
import {
  normaliseTaskUpdate,
  readNoteSource,
  staleContactMessage,
  staleOwnerMessage,
} from "@/lib/ai/task-update";
import type { NoteSource, TaskUpdateChanges } from "@/lib/ai/task-update";
import { draftDependsOn, type DraftDependsOnItem, type DraftLinkItem } from "@/lib/task-dependencies";
import { draftLinkStatus, linkTitle, readDraftLinks } from "@/lib/draft-links";
import {
  RECORDER_SETTINGS_HREF,
  RECORDER_UNKNOWN_OWNER_MESSAGE,
} from "@/lib/integrations/recorder";
import DraftDependencies, { type DraftLinkDescription } from "./DraftDependencies";
import DraftDependenciesField from "./DraftDependenciesField";
import Button from "@/app/ui/Button";
import Textarea from "@/app/ui/Textarea";
import IconButton from "@/app/ui/IconButton";
import type { ToastAction } from "@/app/ui/Toast";
import type {
  ClientTask,
  AIDraft,
  DraftPayload,
  DraftOverrides,
  VendorUserOption,
  ContactOption,
  PhaseOption,
  OpenTaskOption,
} from "./types";

export type DraftMode = "pending" | "applied" | "rejected";
type DraftErrors = Record<number, string | null>;
type Priority = "low" | "medium" | "high";

/** Created task as returned by the approve route (`result.created.task`). */
/** The task row the approve route returns; the board appends it as-is. */
type CreatedTask = ClientTask;

interface AIDraftInboxProps {
  initialDrafts: AIDraft[];
  mode?: DraftMode;
  query?: string;
  vendorUsers?: VendorUserOption[];
  contacts?: ContactOption[];
  phases?: PhaseOption[];
  openTasks?: OpenTaskOption[];
  onTaskCreated?: ((task: CreatedTask) => void) | null;
}

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
  onTaskCreated = null,
}: AIDraftInboxProps) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyIds, setBusyIds] = useState(new Set<number>());
  const [errors, setErrors] = useState<DraftErrors>({});
  const [selectedIds, setSelectedIds] = useState(new Set<number>());
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [drawerEventId, setDrawerEventId] = useState<number | null>(null);
  const [siblingStatus, setSiblingStatus] = useState<SiblingStatusOverlay>({});

  // Toast owns its own timing, hover-pause and exit animation.
  function flashToast(message: string, action: ToastAction | null = null) {
    pushToast(message, action);
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

  function setBusy(id: number, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelected(id: number) {
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

  async function handleApprove(draft: AIDraft, overrides: DraftOverrides = {}) {
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
      const result = await res.json().catch(() => ({}));
      // Cards waiting on this draft now read "created as RAY-n, will link".
      setSiblingStatus((prev) => ({
        ...prev,
        [draft.id]: { status: "applied", taskCode: result.created?.task?.taskId ?? null },
      }));
      focusAfterCardGone(draft.id);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
      if (draft.action === "draft_followup") {
        flashToast("Sent, comment posted on task");
      } else if (draft.action === "create_task" && result.created?.task) {
        // An approved create_task used to just make its row disappear, with
        // nothing saying where the task went. It can land in a column that is
        // off the right-hand edge of the board, so name the phase and offer a
        // link that scrolls straight to it.
        const { task, phaseName, onboardingId } = result.created;
        // When this inbox is mounted inside the onboarding's own Actions tab,
        // the board is already on screen holding its tasks in client state, so
        // push the new one in. Without this the card only appears on reload.
        if (onTaskCreated) onTaskCreated(task);
        const label = task.taskId || "task";
        // Tasks approved earlier that were waiting on this draft are now linked to it.
        const linked = Array.isArray(result.resolvedLinks)
          ? result.resolvedLinks.filter((l: { state?: string }) => l.state === "linked").length
          : 0;
        const linkedNote = linked > 0 ? `; linked ${linked} task${linked > 1 ? "s" : ""} waiting on it` : "";
        flashToast(
          (phaseName ? `Created ${label} in ${phaseName}` : `Created ${label}`) + linkedNote,
          onboardingId && task.id
            ? { href: `/onboardings/${onboardingId}?tab=tasks&task=${task.id}`, label: "View" }
            : null
        );
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: (err as Error).message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function handleReject(draft: AIDraft, reason: string | null = null) {
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
      const result = await res.json().catch(() => ({}));
      setSiblingStatus((prev) => ({ ...prev, [draft.id]: { status: "rejected", taskCode: null } }));
      focusAfterCardGone(draft.id);
      // Drafts that waited on this one keep it as a text blocker: say so. A
      // count, not their titles: a toast is two lines at most, and each
      // waiting card already reads "rejected, kept as a text blocker".
      const dependents: { title: string }[] = Array.isArray(result.dependents) ? result.dependents : [];
      if (dependents.length > 0) {
        const one = dependents.length === 1;
        flashToast(`${one ? "1 draft" : `${dependents.length} drafts`} depended on this; ${one ? "it keeps" : "they keep"} it as a text blocker`);
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: (err as Error).message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function handleBulkReject(ids: number[], reason: string | null = null) {
    // Sequential to keep error messages per-row; small N.
    for (const id of ids) {
      const draft = drafts.find((d) => d.id === id);
      if (!draft) continue;
       
      await handleReject(draft, reason);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, position: "relative" }}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
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
          siblingStatus={siblingStatus}
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
          siblingStatus={siblingStatus}
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

/**
 * Sibling drafts this inbox approved or rejected since it loaded, layered over
 * the server's `linkedDrafts` so a waiting card updates without a reload
 * (GAPS-PLAN feature 3).
 */
export type SiblingStatusOverlay = Record<number, { status: string; taskCode: string | null }>;

/** How each sibling-draft link on `draft` reads: title + what approval does / did. */
function linkDescriber(draft: AIDraft, overlay?: SiblingStatusOverlay) {
  const applied = draft.status === "pending" ? [] : readDraftLinks(draft.payload);
  return (link: DraftLinkItem): DraftLinkDescription => {
    const id = link.draftId;
    const base = id != null ? draft.linkedDrafts?.find((l) => l.id === id) ?? null : null;
    const local = id != null ? overlay?.[id] : undefined;
    const sibling = id != null && (base || local)
      ? {
          id,
          title: base?.title ?? link.title ?? null,
          status: local?.status ?? base?.status ?? "pending",
          taskCode: local ? local.taskCode : base?.taskCode ?? null,
        }
      : null;
    const entry = id != null ? applied.find((a) => a.draftId === id) ?? null : null;
    return { title: linkTitle(link, sibling), ...draftLinkStatus(sibling, entry) };
  };
}

/** Bucket a draft's createdAt into Today / Yesterday / older (YYYY-MM-DD). */
function getDateBucket(iso: string | null | undefined): string {
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

function bucketLabel(bucket: string): string {
  if (bucket === "today") return "Today";
  if (bucket === "yesterday") return "Yesterday";
  if (bucket === "older") return "Older";
  return new Date(bucket).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function bucketSortKey(bucket: string): number {
  if (bucket === "today") return Number.MAX_SAFE_INTEGER;
  if (bucket === "yesterday") return Number.MAX_SAFE_INTEGER - 1;
  if (bucket === "older") return Number.MIN_SAFE_INTEGER;
  return new Date(bucket).getTime();
}

/** Group a flat draft list into [{ bucket, drafts }] sorted newest-first. */
function buildDateBuckets(drafts: AIDraft[]): DateBucket[] {
  const buckets = new Map<string, AIDraft[]>();
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
function groupBucketByMeeting(drafts: AIDraft[]) {
  const byEvent = new Map<number, AIDraft[]>();
  const looseDrafts: AIDraft[] = [];
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

interface DateBucket {
  bucket: string;
  drafts: AIDraft[];
}

/** Handlers + lookups threaded from the inbox down to each card. */
interface DraftListContext {
  mode: DraftMode;
  busyIds: Set<number>;
  errors: DraftErrors;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onApprove: (draft: AIDraft, overrides?: DraftOverrides) => unknown;
  onReject: (draft: AIDraft, reason?: string | null) => unknown;
  vendorUsers: VendorUserOption[];
  contacts: ContactOption[];
  phases: PhaseOption[];
  openTasks: OpenTaskOption[];
  siblingStatus?: SiblingStatusOverlay;
  onMeetingClick?: ((eventId: number) => void) | null;
}

interface DraftColumnProps extends DraftListContext {
  title: string;
  buckets: DateBucket[];
  variant: "followup" | "action";
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
  siblingStatus,
  onMeetingClick,
}: DraftColumnProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, minWidth: 0 }}>
      <h2 data-column-heading tabIndex={-1} style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.6 }}>
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
                              siblingStatus,
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
                        siblingStatus,
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
function MeetingPill({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <div className="meeting-separator">
      {/* eslint-disable-next-line no-restricted-syntax -- clickable row, not a DS button */}
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
function renderActionCard(draft: AIDraft, ctx: DraftListContext) {
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
        siblingStatus={ctx.siblingStatus}
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
      siblingStatus={ctx.siblingStatus}
    />
  );
}

/** Transient confirmation banner — shown for ~4s after Send-to-portal. */
function BulkActionBar({
  count,
  onReject,
  onClear,
}: {
  count: number;
  onReject: () => void;
  onClear: () => void;
}) {
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
        <Button
          onClick={onClear}
          variant="secondary"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Clear
        </Button>
        <Button onClick={onReject} variant="destructive" size="xs">
          Reject selected
        </Button>
      </div>
    </div>
  );
}

export interface DraftCardProps {
  draft: AIDraft;
  mode: DraftMode;
  busy: boolean;
  error?: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: (overrides: DraftOverrides) => void;
  onReject: () => void;
  openTasks?: OpenTaskOption[];
  vendorUsers?: VendorUserOption[];
  contacts?: ContactOption[];
  /** Sibling drafts approved / rejected in this session (feature 3). */
  siblingStatus?: SiblingStatusOverlay;
  /** Passed by InlineEventDrafts but never read by DraftCard. */
  onStartEdit?: () => void;
  /** Passed by InlineEventDrafts but never read by DraftCard. */
  onCancelEdit?: () => void;
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
  siblingStatus,
}: DraftCardProps) {
  const { action, payload, confidence, source, status, rejectedReason } = draft;
  const isPending = mode === "pending";
  const verb = describeActionVerb(action, payload);
  const taskTitle = lookupTaskTitle(openTasks, payload?.taskId) ?? `Task #${payload?.taskId ?? ""}`;
  const matchedTask = openTasks.find((t) => Number(t.id) === Number(payload?.taskId));

  // Edit-before-approve. Local overrides start blank; when the user opens
  // the editor each variant pre-fills from `payload`. Approve passes the
  // overrides object through to /approve so the backend merges them.
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<StatusOverrides>({});
  const editable = isEditableAction(action, payload);

  // Existing-task updates (match_existing) carry every change in `changes`
  // (lib/ai/task-update.ts normalises legacy single-action rows), shown as a
  // per-field before → after list and edited field by field.
  const isUpdate = action === "match_existing";
  const update = isUpdate ? normaliseTaskUpdate(payload) : null;
  const before = taskBefore(matchedTask);
  const [updateEdits, setUpdateEdits] = useState<TaskUpdateEdits | null>(null);

  function openEdit() {
    if (isUpdate && update) setUpdateEdits(initialUpdateEdits(proposedChanges, before));
    else setOverrides(initialOverridesFor(action, payload));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setOverrides({});
    setUpdateEdits(null);
  }

  // A proposed owner / assignee who is no longer around: the reviewer must
  // pick someone or leave it unassigned before approving (never dropped
  // silently). `resolved` holds that choice when the editor isn't open.
  const [resolved, setResolved] = useState<PeopleChoice>({});
  const proposedChanges: TaskUpdateChanges = update ? { ...update.changes, ...resolved } : {};
  // In the editor, a field left at the task's current person is "no change",
  // so only a changed value can be stale.
  const currentPeople = editing && updateEdits
    ? {
        ownerId: updateEdits.ownerId !== before.ownerId ? updateEdits.ownerId : null,
        assigneeContactId: updateEdits.assigneeContactId !== before.assigneeContactId ? updateEdits.assigneeContactId : null,
      }
    : { ownerId: proposedChanges.ownerId ?? null, assigneeContactId: proposedChanges.assigneeContactId ?? null };
  const stale = isUpdate && isPending
    ? stalePeople(currentPeople, vendorUsers, contacts, {
        ownerId: update?.changes.ownerId,
        ownerName: payload?.ownerName,
        assigneeContactId: update?.changes.assigneeContactId,
        assigneeContactName: payload?.assigneeContactName,
      })
    : NO_STALE;

  const cardRef = useRef<HTMLDivElement>(null);

  function resolvePerson(choice: PeopleChoice) {
    setResolved((prev) => ({ ...prev, ...choice }));
    if (editing) setUpdateEdits((prev) => (prev ? { ...prev, ...choice } : prev));
    focusAfterResolve(cardRef.current);
  }

  function editedOverrides(): DraftOverrides {
    if (isUpdate && editing && updateEdits) return { changes: diffUpdateEdits(updateEdits, before) };
    if (isUpdate && Object.keys(resolved).length > 0) return { changes: proposedChanges };
    if (!editing) return {};
    return overrides;
  }

  function patchOverrides(patch: StatusOverrides) {
    setOverrides((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div
      ref={cardRef}
      className="draft-card"
      data-draft-card
      data-draft-id={draft.id}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
          {isUpdate && update ? (
            editing && updateEdits ? (
              <TaskUpdateEditForm
                taskId={matchedTask?.id}
                edits={updateEdits}
                before={before}
                known={!!matchedTask}
                onChange={(patch) => setUpdateEdits((prev) => (prev ? { ...prev, ...patch } : prev))}
                vendorUsers={vendorUsers}
                contacts={contacts}
                disabled={busy}
                openTasks={openTasks}
                describeLink={linkDescriber(draft, siblingStatus)}
              />
            ) : (
              <TaskUpdateDiff
                task={matchedTask}
                changes={proposedChanges}
                names={{ owner: asName(payload?.ownerName), assignee: asName(payload?.assigneeContactName) }}
                noteSource={readNoteSource(payload?.noteSource)}
                flagOnlyReassign={update.action === "reassign" && Object.keys(proposedChanges).length === 0}
                before={before}
                vendorUsers={vendorUsers}
                contacts={contacts}
                onPickOwner={isPending && !busy ? openEdit : undefined}
                openTasks={openTasks}
                describeLink={linkDescriber(draft, siblingStatus)}
              />
            )
          ) : editing ? (
            <DraftEditPanel
              action={action}
              overrides={overrides}
              onChange={patchOverrides}
              disabled={busy}
            />
          ) : (
            <DraftCardTaskPreview task={matchedTask} fallbackTitle={taskTitle} />
          )}
        </div>
      </div>

      <StalePeopleWarnings
        stale={stale}
        vendorUsers={vendorUsers}
        contacts={contacts}
        onResolve={resolvePerson}
        disabled={busy}
      />

      {visibleError(error, stale) && (
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
          <Button
            onClick={editing ? cancelEdit : onReject}
            disabled={busy}
            variant="tertiary"
            data-dismiss={!editing ? true : undefined}
            style={{ padding: "4px 8px", fontSize: 14, opacity: busy ? 0.5 : 1 }}
          >
            {editing ? "Cancel" : "Dismiss"}
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            {editable && !editing && (
              <Button
                onClick={openEdit}
                disabled={busy}
                variant="tertiary"
                style={{ padding: "4px 10px", fontSize: 14, opacity: busy ? 0.5 : 1 }}
              >
                Edit
              </Button>
            )}
            <Button
              data-approve
              onClick={() => {
                onApprove(editedOverrides());
                if (editing) setEditing(false);
              }}
              disabled={busy || selected}
              aria-disabled={busy || selected}
              aria-label={selected ? "Unselect to approve individually" : undefined}
              title={selected ? "Unselect to approve individually" : undefined}
              variant="secondary"
              style={{ padding: "4px 14px", fontSize: 14, opacity: busy || selected ? 0.5 : 1 }}
            >
              {busy ? "…" : "Approve"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether the given draft has a known edit-before-approve form.
 *  comment_only is retired (filtered out of the list). */
function isEditableAction(action: string, payload: DraftPayload | null) {
  if (action === "update_status") return true;
  if (action === "match_existing") return payload?.action !== "comment_only";
  return false;
}

/** Edit-before-approve overrides for an update_status DraftCard. */
type StatusOverrides = {
  newStatus?: string;
};

/** Pre-fill the overrides object from the draft's payload so the editor
 *  opens with the AI's suggestion as the starting point. */
function initialOverridesFor(action: string, payload: DraftPayload | null): StatusOverrides {
  if (action === "update_status") {
    return { newStatus: payload?.newStatus ?? "Not started" };
  }
  return {};
}

/** Inline status editor for an update_status DraftCard. Replaces the
 *  right-column preview while the user is editing. */
interface DraftEditPanelProps {
  action: string;
  overrides: StatusOverrides;
  onChange: (patch: StatusOverrides) => void;
  disabled: boolean;
}

function DraftEditPanel({ action, overrides, onChange, disabled }: DraftEditPanelProps) {
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
    </div>
  );
}

// ── People who are no longer around (create + update drafts) ────────────────

/** An explicit choice the reviewer made for a gone owner / assignee. */
type PeopleChoice = { ownerId?: number | null; assigneeContactId?: number | null };

type StalePeople = {
  owner: { message: string; pickLabel?: string; href?: string } | null;
  assignee: { message: string } | null;
};

const NO_STALE: StalePeople = { owner: null, assignee: null };

/**
 * Which of a draft's people are gone: an owner not among the vendor users,
 * an assignee not among this onboarding's contacts. Only judged when the list
 * was loaded (an empty list means "unknown", and the approve route still
 * checks). Names come from the snapshot taken when the draft was created.
 */
function stalePeople(
  current: { ownerId: number | null; assigneeContactId: number | null },
  vendorUsers: VendorUserOption[],
  contacts: ContactOption[],
  proposed: {
    ownerId?: unknown;
    ownerName?: unknown;
    assigneeContactId?: unknown;
    assigneeContactName?: unknown;
    ownerFromRecorder?: unknown;
  }
): StalePeople {
  const nameFor = (id: number, proposedId: unknown, name: unknown) =>
    Number(proposedId) === id && typeof name === "string" ? name : null;
  const ownerGone = current.ownerId != null && vendorUsers.length > 0
    && !vendorUsers.some((u) => u.id === current.ownerId);
  const assigneeGone = current.assigneeContactId != null && contacts.length > 0
    && !contacts.some((c) => c.id === current.assigneeContactId);
  const recorderUnknown = proposed.ownerFromRecorder === true && current.ownerId == null && !ownerGone;
  return {
    owner: ownerGone
      ? { message: staleOwnerMessage(nameFor(current.ownerId!, proposed.ownerId, proposed.ownerName)) }
      : recorderUnknown
        ? {
            message: RECORDER_UNKNOWN_OWNER_MESSAGE,
            pickLabel: "Pick an owner",
            href: RECORDER_SETTINGS_HREF,
          }
        : null,
    assignee: assigneeGone
      ? { message: staleContactMessage(nameFor(current.assigneeContactId!, proposed.assigneeContactId, proposed.assigneeContactName)) }
      : null,
  };
}

/**
 * After a gone person is resolved the warning unmounts, which would drop
 * keyboard focus to <body>. Move it to the next warning's picker if one is
 * left, else to the card's approve button. Runs after React commits.
 */
/**
 * "Remove due date" and "Keep <date>" replace each other, so the button that
 * was pressed unmounts. Hand focus to whichever toggle is now showing.
 */
function focusDueToggle(from: HTMLElement) {
  const field = from.closest<HTMLElement>("[data-due-field]");
  requestAnimationFrame(() => {
    field?.querySelector<HTMLElement>("[data-due-toggle]:not([disabled])")?.focus();
  });
}

function focusAfterResolve(card: HTMLElement | null) {
  requestAnimationFrame(() => {
    const next =
      card?.querySelector<HTMLElement>("[data-stale-warning] button:not([disabled])") ??
      card?.querySelector<HTMLElement>("[data-approve]:not([disabled])");
    next?.focus();
  });
}

/**
 * After Approve / Dismiss the card unmounts. Hand focus to the next card's
 * primary action (or the previous, or the column heading) so keyboard users
 * are not dropped onto <body>.
 */
function focusAfterCardGone(draftId: number) {
  const card = document.querySelector<HTMLElement>(`[data-draft-card][data-draft-id="${draftId}"]`);
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-draft-card]"));
  const i = card ? cards.indexOf(card) : -1;
  const neighbour = i >= 0 ? (cards[i + 1] ?? cards[i - 1]) : null;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const still = neighbour && document.contains(neighbour)
        ? neighbour
        : document.querySelector<HTMLElement>("[data-draft-card]");
      const btn = still?.querySelector<HTMLElement>(
        "[data-approve]:not([disabled]), [data-dismiss]:not([disabled])"
      );
      (btn ?? document.querySelector<HTMLElement>("[data-column-heading]"))?.focus();
    });
  });
}

/** The card's error, unless it only repeats a stale-person warning already on screen. */
function visibleError(error: string | null | undefined, stale: StalePeople): string | null {
  if (!error) return null;
  return error === stale.owner?.message || error === stale.assignee?.message ? null : error;
}

/** What the reviewer chose for a gone person, so they see what will be applied. */
function ResolvedPeople({
  resolved,
  vendorUsers,
  contacts,
  onChange,
  disabled,
}: {
  resolved: PeopleChoice;
  vendorUsers: VendorUserOption[];
  contacts: ContactOption[];
  onChange: (key: keyof PeopleChoice) => void;
  disabled: boolean;
}) {
  const rows: { key: keyof PeopleChoice; label: string; value: string }[] = [];
  if (resolved.ownerId !== undefined) {
    rows.push({
      key: "ownerId",
      label: "Owner",
      value: resolved.ownerId === null ? "unassigned" : personName(vendorUsers, resolved.ownerId),
    });
  }
  if (resolved.assigneeContactId !== undefined) {
    rows.push({
      key: "assigneeContactId",
      label: "Assignee",
      value: resolved.assigneeContactId === null ? "unassigned" : personName(contacts, resolved.assigneeContactId),
    });
  }
  if (rows.length === 0) return null;
  return (
    <ul aria-live="polite" className="flex flex-col gap-1 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted">{r.label}:</span>
          <span className="text-text">{r.value}</span>
          <Button variant="tertiary" size="xs" onClick={() => onChange(r.key)} disabled={disabled}>
            Change
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The warning (plus the way out) for each gone person, shown before approving. */
function StalePeopleWarnings({
  stale,
  vendorUsers,
  contacts,
  onResolve,
  disabled,
}: {
  stale: StalePeople;
  vendorUsers: VendorUserOption[];
  contacts: ContactOption[];
  onResolve: (choice: PeopleChoice) => void;
  disabled: boolean;
}) {
  if (!stale.owner && !stale.assignee) return null;
  return (
    <div className="flex flex-col gap-3">
      {stale.owner && (
        <StalePersonWarning
          message={stale.owner.message}
          icon={<OwnerIcon />}
          pickLabel={stale.owner.pickLabel ?? "Pick a new owner"}
          href={stale.owner.href}
          options={vendorUsers.map((u) => ({ id: u.id, label: u.name || u.email }))}
          onPick={(ownerId) => onResolve({ ownerId })}
          disabled={disabled}
        />
      )}
      {stale.assignee && (
        <StalePersonWarning
          message={stale.assignee.message}
          icon={<AssigneeIcon />}
          pickLabel="Pick a new assignee"
          options={contacts.map((c) => ({ id: c.id, label: c.name || c.email }))}
          onPick={(assigneeContactId) => onResolve({ assigneeContactId })}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/** Shared missing-person/recorder warning: colour the message, keep the
 *  resolution controls neutral, and avoid a second bordered container. */
function StalePersonWarning({
  message,
  icon,
  pickLabel,
  href,
  options,
  onPick,
  disabled,
}: {
  message: string;
  icon: ReactNode;
  pickLabel: string;
  href?: string;
  options: SelectPillOption[];
  onPick: (id: number | null) => void;
  disabled: boolean;
}) {
  return (
    <div role="alert" data-stale-warning className="flex flex-col gap-2 text-sm">
      <span className="flex items-start gap-2 text-alert">
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
          <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.2 9a1 1 0 0 1-.87 1.5H2.8a1 1 0 0 1-.87-1.5l5.2-9Z" stroke="currentColor" strokeLinejoin="round" />
          <path d="M8 6v3m0 1.5v.1" stroke="currentColor" strokeLinecap="round" />
        </svg>
        <span>{message}.</span>
      </span>
      {href && (
        <Link href={href} className="text-sm underline underline-offset-2 w-fit">
          Who records meetings
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <SelectPill
            icon={icon}
            label={pickLabel}
            valueLabel={null}
            options={options}
            selected={undefined}
            onSelect={(id) => onPick(id)}
            disabled={disabled}
          />
        </div>
        <Button variant="tertiary" size="xs" onClick={() => onPick(null)} disabled={disabled}>
          Leave unassigned
        </Button>
      </div>
    </div>
  );
}

// ── Existing-task update (match_existing) ────────────────────────────────────

/** The task's current values, as far as the board knows them. */
type TaskBefore = {
  ownerId: number | null;
  assigneeContactId: number | null;
  due: string | null;
  priority: Priority | null;
};

function taskBefore(task: OpenTaskOption | undefined): TaskBefore {
  const priority = task?.priority;
  return {
    ownerId: task?.ownerId ?? null,
    assigneeContactId: task?.assigneeContactId ?? null,
    due: task?.due ? String(task.due).slice(0, 10) : null,
    priority: priority === "low" || priority === "medium" || priority === "high" ? priority : null,
  };
}

/** Editor state: every field holds its value AFTER approval. A field equal
 *  to the task's current value is "no change" and is not sent. */
type TaskUpdateEdits = {
  ownerId: number | null;
  assigneeContactId: number | null;
  dueDate: string;
  priority: Priority | null;
  appendNotes: string;
  /** Blockers the update adds (lib/task-dependencies.ts), sibling drafts included. */
  dependsOn: DraftDependsOnItem[];
};

function initialUpdateEdits(changes: TaskUpdateChanges, before: TaskBefore): TaskUpdateEdits {
  return {
    ownerId: changes.ownerId !== undefined ? changes.ownerId : before.ownerId,
    assigneeContactId: changes.assigneeContactId !== undefined ? changes.assigneeContactId : before.assigneeContactId,
    // "" = no due date (a proposed removal starts empty).
    dueDate: changes.dueDate === null ? "" : changes.dueDate ?? before.due ?? "",
    priority: changes.priority ?? before.priority,
    appendNotes: changes.appendNotes ?? "",
    dependsOn: changes.dependsOn ?? [],
  };
}

/** The `changes` override for the approve route: only fields that differ
 *  from the task as it stands. An emptied due date on a task that has one is
 *  `dueDate: null` (remove it). */
function diffUpdateEdits(edits: TaskUpdateEdits, before: TaskBefore): TaskUpdateChanges {
  const changes: TaskUpdateChanges = {};
  if (edits.ownerId !== before.ownerId) changes.ownerId = edits.ownerId;
  if (edits.assigneeContactId !== before.assigneeContactId) changes.assigneeContactId = edits.assigneeContactId;
  const due = edits.dueDate.slice(0, 10);
  if (due !== (before.due ?? "")) changes.dueDate = due === "" ? null : due;
  if (edits.priority && edits.priority !== before.priority) changes.priority = edits.priority;
  if (edits.appendNotes.trim()) changes.appendNotes = edits.appendNotes.trim();
  if (edits.dependsOn.length > 0) changes.dependsOn = edits.dependsOn;
  return changes;
}

const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

function formatDay(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function personName(
  list: { id: number; name?: string | null; email?: string | null }[],
  id: number | null | undefined,
  fallback?: string | null
) {
  if (id == null) return "None";
  const hit = list.find((x) => x.id === id);
  return hit?.name || hit?.email || fallback || "Unknown";
}

/** A name snapshot from a draft payload (JSON, so unknown until checked). */
function asName(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x : null;
}

/** One field of the update diff: the label on its own line, then
 *  "before → after" below it. Nothing truncates: in the card's narrow
 *  column a long value wraps instead, so every value is readable in full
 *  (no hover-only tooltip, which keyboard users never get). Proposed values
 *  stay bold, including removals; current values lift to primary text on hover. */
function UpdateDiffRow({
  icon,
  label,
  before,
  after,
}: {
  icon: ReactNode;
  label: string;
  before: string;
  after: string;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        {icon}
        {label}
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="draft-diff-before break-words text-text-muted">{before}</span>
        <span aria-hidden className="text-text-muted">→</span>
        <span className="sr-only">changes to</span>
        <strong className="break-words font-bold text-text">{after}</strong>
      </span>
    </li>
  );
}

/** "Before" value for the diff: "—" when the task isn't in the loaded list,
 *  so an unknown value never reads as "None". */
function beforeLabel(known: boolean, value: string | null) {
  if (!known) return "—";
  return value ?? "None";
}

/** Right-column view: one before → after row per proposed change, then the
 *  note it would append. Task identity is already in the card's left column. */
function TaskUpdateDiff({
  task,
  changes,
  flagOnlyReassign,
  before,
  vendorUsers,
  contacts,
  onPickOwner,
  names,
  noteSource,
  openTasks,
  describeLink,
}: {
  /** To name blocker tasks in changes.dependsOn. */
  openTasks: OpenTaskOption[];
  /** Names sibling-draft blockers and their state. */
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  task: OpenTaskOption | undefined;
  changes: TaskUpdateChanges;
  /** Names snapshotted when the draft was created, for people no longer listed. */
  names: { owner: string | null; assignee: string | null };
  /** Where the appended note will be stamped from (meeting day + source). */
  noteSource: NoteSource | null;
  flagOnlyReassign: boolean;
  before: TaskBefore;
  vendorUsers: VendorUserOption[];
  contacts: ContactOption[];
  /** Opens the editor; only offered on a flag-only reassign (pending drafts). */
  onPickOwner?: () => void;
}) {
  const known = !!task;
  return (
    <div className="draft-card-preview flex flex-col gap-3 rounded-lg px-4 py-3">
      <ul aria-label="Proposed changes" className="flex flex-col gap-3">
        {changes.ownerId !== undefined && (
          <UpdateDiffRow
            icon={<OwnerIcon />}
            label="Owner"
            before={beforeLabel(known, personName(vendorUsers, before.ownerId))}
            after={personName(vendorUsers, changes.ownerId, names.owner)}
          />
        )}
        {changes.assigneeContactId !== undefined && (
          <UpdateDiffRow
            icon={<AssigneeIcon />}
            label="Assignee"
            before={beforeLabel(known, personName(contacts, before.assigneeContactId))}
            after={personName(contacts, changes.assigneeContactId, names.assignee)}
          />
        )}
        {changes.dueDate !== undefined && (
          <UpdateDiffRow
            icon={<CalendarIcon />}
            label="Due date"
            before={beforeLabel(known, formatDay(before.due))}
            after={changes.dueDate === null ? "none" : formatDay(changes.dueDate) ?? changes.dueDate}
          />
        )}
        {changes.priority !== undefined && (
          <UpdateDiffRow
            icon={<PriorityIcon priority={changes.priority} />}
            label="Priority"
            before={beforeLabel(known, before.priority ? PRIORITY_LABEL[before.priority] : null)}
            after={PRIORITY_LABEL[changes.priority]}
          />
        )}
        {flagOnlyReassign && (
          <li className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
            <OwnerIcon />
            Reassignment discussed.
            {onPickOwner && (
              <Button variant="tertiary" size="xs" onClick={onPickOwner}>
                Pick the new owner
              </Button>
            )}
          </li>
        )}
      </ul>
      {changes.appendNotes && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="inline-flex flex-wrap items-center gap-1.5 text-text-muted">
            <NotesIcon />
            Adds note
            {noteSource && (
              <span className="text-xs">
                (dated {formatDay(noteSource.date)}, {noteSource.label})
              </span>
            )}
          </span>
          <p className="whitespace-pre-wrap leading-normal text-text-secondary">{changes.appendNotes}</p>
        </div>
      )}
      {changes.dependsOn && changes.dependsOn.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-text-muted">
            <DependenciesIcon />
            Adds blockers
          </span>
          <DraftDependencies items={changes.dependsOn} tasks={openTasks} describeLink={describeLink} />
        </div>
      )}
    </div>
  );
}

/** "Now: …" hint under an edit-form field: the task's current value, or "—"
 *  when the task isn't in the loaded list. */
function NowHint({ known, value }: { known: boolean; value: string | null }) {
  return <span className="text-xs text-text-muted">Now: {beforeLabel(known, value)}</span>;
}

/** Edit form for an existing-task update: the same field pills as the
 *  create-task editor, each showing what the task has today, plus the note
 *  to append. Only fields that end up different from today are sent. */
function TaskUpdateEditForm({
  taskId,
  edits,
  before,
  known,
  onChange,
  vendorUsers,
  contacts,
  disabled,
  openTasks,
  describeLink,
}: {
  taskId?: number;
  openTasks: OpenTaskOption[];
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  edits: TaskUpdateEdits;
  before: TaskBefore;
  /** Whether the task (and so its current values) is in the loaded list. */
  known: boolean;
  onChange: (patch: Partial<TaskUpdateEdits>) => void;
  vendorUsers: VendorUserOption[];
  contacts: ContactOption[];
  disabled: boolean;
}) {
  const ownerName = edits.ownerId != null ? personName(vendorUsers, edits.ownerId) : null;
  const assigneeName = edits.assigneeContactId != null ? personName(contacts, edits.assigneeContactId) : null;
  const notesId = useId();
  return (
    <div className="draft-card-preview flex flex-col gap-4 rounded-lg px-4 py-3">
      <div className="flex flex-col gap-1">
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
        <NowHint known={known} value={personName(vendorUsers, before.ownerId)} />
      </div>
      <div className="flex flex-col gap-1">
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
        <NowHint known={known} value={personName(contacts, before.assigneeContactId)} />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-36 flex-1 flex-col gap-1" data-due-field>
          <DueDatePill value={edits.dueDate} onChange={(dueDate) => onChange({ dueDate })} disabled={disabled} />
          <NowHint known={known} value={formatDay(before.due)} />
          {!edits.dueDate && before.due && (
            <span className="flex flex-wrap items-center gap-2 text-xs text-alert" aria-live="polite">
              Will remove the due date
              <Button
                variant="tertiary"
                size="xs"
                onClick={(e) => {
                  focusDueToggle(e.currentTarget);
                  onChange({ dueDate: before.due ?? "" });
                }}
                disabled={disabled}
                data-due-toggle
              >
                Keep {formatDay(before.due)}
              </Button>
            </span>
          )}
          {edits.dueDate && (
            <Button
              variant="tertiary"
              size="xs"
              className="self-start"
              onClick={(e) => {
                focusDueToggle(e.currentTarget);
                onChange({ dueDate: "" });
              }}
              disabled={disabled}
              data-due-toggle
            >
              Remove due date
            </Button>
          )}
        </div>
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <PriorityPill
            value={edits.priority ?? undefined}
            onChange={(priority) => onChange({ priority })}
            disabled={disabled}
          />
          <NowHint known={known} value={before.priority ? PRIORITY_LABEL[before.priority] : null} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={notesId} className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <NotesIcon />
          Add to notes
        </label>
        <Textarea
          id={notesId}
          value={edits.appendNotes}
          onChange={(e) => onChange({ appendNotes: e.target.value })}
          disabled={disabled}
          placeholder="Added to the task's notes as a new dated line (optional)"
        />
      </div>
      <DraftDependenciesField
        items={edits.dependsOn}
        tasks={openTasks.filter((task) => task.id !== taskId)}
        disabled={disabled}
        onChange={(dependsOn) => onChange({ dependsOn })}
        describeLink={describeLink}
      />
    </div>
  );
}

interface ValueEditorProps<T> {
  value: T | undefined;
  onChange: (value: T) => void;
  disabled: boolean;
}

function StatusOverrideEditor({ value, onChange, disabled }: ValueEditorProps<string>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>New status</span>
      <div ref={ref} className="relative" style={{ width: "100%" }}>
        {/* eslint-disable-next-line no-restricted-syntax -- dropdown trigger, becomes Select in slice 3 */}
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

const TASK_STATUS_OPTIONS = TASK_STATUSES;

/** Verb-only label for an action draft — kept short so the left column
 *  stays compact. Full payload details live on the right (task preview). */
function describeActionVerb(action: string, payload: DraftPayload | null) {
  if (action === "match_existing") {
    const sub = normaliseTaskUpdate(payload).action;
    if (sub === "reassign") return "Reassign";
    if (sub === "reprioritise") return "Re-prioritise";
    if (sub === "update_due_date") return "Update due date";
    if (sub === "add_notes") return "Add notes";
    return "Update task";
  }
  if (action === "update_status") return `Mark as ${payload?.newStatus ?? "—"}`;
  if (action === "draft_followup") return "Follow up";
  if (action === "create_task") return "Create task";
  return action;
}

function lookupTaskTitle(openTasks: OpenTaskOption[], taskId: number | string | null | undefined) {
  if (taskId == null) return null;
  const t = openTasks.find((x) => Number(x.id) === Number(taskId));
  return t?.title ?? null;
}

/** Right-column preview for an existing-task draft. Renders a compact
 *  task summary using the data we have (looked up from `openTasks`).
 *  Falls back to a title-only stub if the task isn't in the list. */
function DraftCardTaskPreview({
  task,
  fallbackTitle,
}: {
  task: OpenTaskOption | undefined;
  fallbackTitle: string;
}) {
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
          <PriorityIcon priority={task.priority as TaskPriority} />
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
export interface FollowupCardProps {
  draft: AIDraft;
  mode: DraftMode;
  busy: boolean;
  error?: string | null;
  onApprove: (overrides: DraftOverrides) => void;
  onReject: () => void;
}

export function FollowupCard({ draft, mode, busy, error, onApprove, onReject }: FollowupCardProps) {
  const isPending = mode === "pending";
  const initial: DraftPayload = draft.payload ?? {};
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setSaveError((err as Error).message);
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
      data-draft-card
      data-draft-id={draft.id}
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
              <IconButton
                onClick={handleCopyBody}
                disabled={!body.trim()}
                aria-label={copied ? "Copied" : "Copy message"}
                title={copied ? "Copied" : "Copy message"}
              >
                <CopyIcon />
              </IconButton>
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
          <Button
            onClick={onReject}
            disabled={busy}
            variant="tertiary"
            data-dismiss
            style={{
              padding: "4px 8px",
              fontSize: 14,
              opacity: busy ? 0.5 : 1,
            }}
          >
            Dismiss
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={mailto}
              className="btn-tertiary text-sm rounded-lg"
              style={{ padding: "4px 10px", fontSize: 14, textDecoration: "none" }}
            >
              Open in mail
            </a>
            <Button
              data-approve
              onClick={() => onApprove({ subject, body })}
              disabled={!canSend}
              variant="secondary"
              style={{
                padding: "4px 10px",
                fontSize: 14,
                opacity: !canSend ? 0.5 : 1,
              }}
              title="Publishes the message body as a Comment visible in the customer portal."
            >
              {busy ? "…" : "Comment"}
            </Button>
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

const followupInputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--surface-hover)",
  borderRadius: 8,
  outline: "none",
};

function FieldBlock({
  label,
  actions,
  children,
}: {
  label: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
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

export function FollowupSparkleIcon() {
  return <Sparkle size={14} />;
}


/** Read-only render for applied/rejected follow-ups — shows what was sent. */
function FollowupBodyReadonly({ payload }: { payload: DraftPayload | null }) {
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
function buildMailto({
  to,
  subject,
  body,
}: {
  to?: string | null;
  subject: string;
  body: string;
}) {
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
/** Normalised create_task payload — what the edit form works on. */
type CreateTaskEdits = {
  title: string;
  description: string;
  ownerId: number | null;
  assigneeContactId: number | null;
  dueDate: string;
  phaseId: number | null;
  priority: Priority;
  /** What the new task waits on: board tasks, text blockers, sibling drafts. */
  dependsOn: DraftDependsOnItem[];
  notes: string;
};

export interface CreateTaskCardProps {
  draft: AIDraft;
  mode: DraftMode;
  busy: boolean;
  error?: string | null;
  selected?: boolean;
  onToggleSelect?: () => void;
  onApprove: (overrides: DraftOverrides) => void;
  onReject: () => void;
  vendorUsers?: VendorUserOption[];
  contacts?: ContactOption[];
  phases?: PhaseOption[];
  openTasks?: OpenTaskOption[];
  /** Sibling drafts approved / rejected in this session (feature 3). */
  siblingStatus?: SiblingStatusOverlay;
}

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
  siblingStatus,
}: CreateTaskCardProps) {
  const describeLink = linkDescriber(draft, siblingStatus);
  const isPending = mode === "pending";
  const original = useMemo(() => normaliseCreateTaskPayload(draft.payload), [draft.payload]);

  const [cardMode, setCardMode] = useState<"compact" | "edit">("compact");
  const [edits, setEdits] = useState(original);
  const [savedPayload, setSavedPayload] = useState(original);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  // A proposed owner / assignee who is no longer around must be replaced or
  // explicitly left unassigned before approving (the route 409s otherwise).
  const [resolved, setResolved] = useState<PeopleChoice>({});
  const people = { ...(cardMode === "edit" ? edits : savedPayload), ...resolved };
  const stale = isPending
    ? stalePeople(
        { ownerId: people.ownerId, assigneeContactId: people.assigneeContactId },
        vendorUsers,
        contacts,
        {
          ownerId: draft.payload?.ownerId,
          ownerName: draft.payload?.ownerName,
          assigneeContactId: draft.payload?.assigneeContactId,
          assigneeContactName: draft.payload?.assigneeContactName,
          ownerFromRecorder: draft.payload?.ownerFromRecorder === true && !("ownerId" in resolved),
        }
      )
    : NO_STALE;

  const cardRef = useRef<HTMLDivElement>(null);

  function resolvePerson(choice: PeopleChoice) {
    setResolved((prev) => ({ ...prev, ...choice }));
    if (cardMode === "edit") setEdits((prev) => ({ ...prev, ...choice }));
    focusAfterResolve(cardRef.current);
  }

  /** Undo a warning choice, so the warning (and its picker) comes back. */
  function unresolvePerson(key: keyof PeopleChoice) {
    setResolved((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // The warning comes back; put focus on its picker.
    focusAfterResolve(cardRef.current);
  }

  function patchEdits(patch: Partial<CreateTaskEdits>) {
    setEdits((prev) => ({ ...prev, ...patch }));
    // A pick in the form itself supersedes an earlier warning choice.
    if ("ownerId" in patch || "assigneeContactId" in patch) {
      setResolved((prev) => {
        const next = { ...prev };
        if ("ownerId" in patch) delete next.ownerId;
        if ("assigneeContactId" in patch) delete next.assigneeContactId;
        return next;
      });
    }
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
      setSaveError((err as Error).message);
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
    onApprove({ ...(cardMode === "edit" ? edits : savedPayload), ...resolved });
  }

  return (
    <div
      ref={cardRef}
      className="draft-card"
      data-draft-card
      data-draft-id={draft.id}
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
          vendorUsers={vendorUsers}
          openTasks={openTasks}
          describeLink={describeLink}
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
          describeLink={describeLink}
        />
      )}

      <StalePeopleWarnings
        stale={stale}
        vendorUsers={vendorUsers}
        contacts={contacts}
        onResolve={resolvePerson}
        disabled={busy || saving}
      />

      {isPending && cardMode === "compact" && (
        <ResolvedPeople
          resolved={resolved}
          vendorUsers={vendorUsers}
          contacts={contacts}
          onChange={unresolvePerson}
          disabled={busy || saving}
        />
      )}

      {(visibleError(error, stale) || saveError) && (
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
          {visibleError(error, stale) || saveError}
        </div>
      )}

      {isPending && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Button
            onClick={handleDismissOrExitEdit}
            disabled={busy || saving}
            variant="tertiary"
            data-dismiss={cardMode !== "edit" ? true : undefined}
            style={{
              padding: "4px 8px",
              fontSize: 14,
              opacity: busy || saving ? 0.5 : 1,
            }}
          >
            {cardMode === "edit" ? "Exit edit" : "Dismiss"}
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Row-level action hierarchy: Create task (secondary) > Edit task
                (ghost) > Dismiss (tertiary text). Deliberately NO primary here —
                this action repeats once per draft down a scrolling page, so a
                filled button would carry no hierarchy and would drown out the
                page-level primary. Carbon/Atlassian: one primary per page. */}
            {cardMode === "compact" ? (
              <Button
                onClick={() => setCardMode("edit")}
                disabled={busy}
                variant="tertiary"
                style={{ padding: "4px 10px", fontSize: 14 }}
              >
                Edit task
              </Button>
            ) : (
              <Button
                onClick={handleSaveDraft}
                disabled={busy || saving || !dirty}
                variant="tertiary"
                style={{ padding: "4px 10px", fontSize: 14, opacity: !dirty || saving ? 0.5 : 1 }}
              >
                {saving ? "…" : "Save draft"}
              </Button>
            )}
            <Button
              data-approve
              onClick={handleCreate}
              disabled={busy || saving || selected}
              aria-disabled={busy || saving || selected}
              aria-label={selected ? "Unselect to approve individually" : undefined}
              title={selected ? "Unselect to approve individually" : undefined}
              variant="secondary"
              style={{ padding: "4px 10px", fontSize: 14, opacity: busy || selected ? 0.5 : 1 }}
            >
              {busy ? "…" : "Create task"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Coerce a raw payload (which may include the legacy `owner: "vendor"|"customer"`
 *  string from older drafts) to the new shape. Any keys not provided default
 *  to safe values. */
function normaliseCreateTaskPayload(payload: DraftPayload | null): CreateTaskEdits {
  const p: DraftPayload = payload ?? {};
  return {
    title: typeof p.title === "string" ? p.title : "",
    description: typeof p.description === "string" ? p.description : "",
    ownerId: Number.isInteger(p.ownerId) ? (p.ownerId as number) : null,
    assigneeContactId: Number.isInteger(p.assigneeContactId) ? (p.assigneeContactId as number) : null,
    dueDate: typeof p.dueDate === "string" ? p.dueDate : "",
    phaseId: Number.isInteger(p.phaseId) ? (p.phaseId as number) : null,
    priority: ["low", "medium", "high"].includes(p.priority as string) ? (p.priority as Priority) : "medium",
    dependsOn: draftDependsOn(p),
    notes: typeof p.notes === "string" ? p.notes : "",
  };
}

function payloadsEqual(a: CreateTaskEdits, b: CreateTaskEdits) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.ownerId === b.ownerId &&
    a.assigneeContactId === b.assigneeContactId &&
    a.dueDate === b.dueDate &&
    a.phaseId === b.phaseId &&
    a.priority === b.priority &&
    JSON.stringify(a.dependsOn) === JSON.stringify(b.dependsOn) &&
    a.notes === b.notes
  );
}

/** Header — breadcrumb + meta rows (shared by compact and edit). */
/** Two-column compact view.
 *  Left: heading (✓ Create task) + task-name code block + meta (✨ miniti · confidence).
 *  Right: the metadata the task would be created with — due date, status,
 *  owner, notes/comments, priority. Rests dim, lifts on row hover. It is NOT a
 *  card and deliberately does not repeat the task title, which is already the
 *  most prominent thing on the left. */
function CreateTaskCompact({
  draft,
  taskTitle,
  payload,
  isPending,
  selected,
  onToggleSelect,
  busy,
  vendorUsers = [],
  openTasks = [],
  describeLink,
}: {
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  draft: AIDraft;
  taskTitle: string;
  payload: CreateTaskEdits;
  isPending: boolean;
  selected: boolean;
  onToggleSelect?: () => void;
  busy: boolean;
  vendorUsers?: VendorUserOption[];
  openTasks?: OpenTaskOption[];
}) {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
        <CreateTaskPreview payload={payload} vendorUsers={vendorUsers} openTasks={openTasks} describeLink={describeLink} />
      </div>
    </div>
  );
}

function CreateTaskHeader({
  draft,
  taskTitle,
  generatedDate,
  isPending,
}: {
  draft: AIDraft;
  taskTitle: string;
  generatedDate: string | null;
  isPending: boolean;
}) {
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

/** The metadata column on a compact draft row — what this task would be
 *  created *with*. No card chrome and no task title (the left column already
 *  owns the name). Dim at rest, lifts on row hover via `.draft-card-preview`. */
function CreateTaskPreview({
  payload,
  vendorUsers = [],
  openTasks = [],
  describeLink,
}: {
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  payload: CreateTaskEdits;
  vendorUsers?: VendorUserOption[];
  openTasks?: OpenTaskOption[];
}) {
  const due = payload.dueDate ? new Date(payload.dueDate) : null;
  const dueLabel = due
    ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const dueAgo = due ? formatDueAgo(due) : null;
  const noteCount = payload.notes && payload.notes.trim() ? 1 : 0;
  const ownerName = vendorUsers.find((u) => u.id === payload.ownerId)?.name || null;
  // A task created from a draft always starts here, so the colour is fixed —
  // but read it from the same map the kanban card uses rather than hardcoding.
  const statusColor = STATUS_COLORS["Not started"];

  // One row per fact, all at kanban-card proportions (text-sm, 14px icons,
  // 18px priority chevrons) so this reads as the same visual language.
  return (
    <div
      className="draft-card-preview"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        textAlign: "right",
        gap: 8,
        justifyContent: "center",
        height: "100%",
      }}
    >
      {/* Row 1: status */}
      <span
        className="text-sm rounded-md"
        style={{ color: statusColor, border: `0.5px solid ${statusColor}`, padding: "2px 4px" }}
      >
        Not started
      </span>

      {/* Row 2: due date */}
      {dueLabel && (
        <span className="text-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CalendarIcon />
          {dueLabel}
          {dueAgo && <span>· {dueAgo}</span>}
        </span>
      )}

      {/* Row 3: owner */}
      {ownerName && (
        <span className="text-sm truncate" style={{ maxWidth: "100%" }} title={`Owner: ${ownerName}`}>
          {ownerName}
        </span>
      )}

      {/* Row 4: notes + comments */}
      <span className="text-sm" style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Notes">
          <NotesIcon />
          {noteCount}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Comments">
          <CommentsIcon />
          0
        </span>
      </span>

      {/* Row 5: priority */}
      <PriorityIcon priority={payload.priority} size={18} />

      {/* Row 6: what it would wait on (board tasks and text blockers) */}
      {payload.dependsOn.length > 0 && (
        <div className="flex w-full min-w-0 items-start justify-end gap-1.5">
          <DependenciesIcon className="shrink-0 mt-1" />
          <DraftDependencies items={payload.dependsOn} tasks={openTasks} align="end" describeLink={describeLink} />
        </div>
      )}
    </div>
  );
}

function formatDueAgo(date: Date) {
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
  describeLink,
}: {
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  edits: CreateTaskEdits;
  onChange: (patch: Partial<CreateTaskEdits>) => void;
  vendorUsers: VendorUserOption[];
  contacts: ContactOption[];
  phases: PhaseOption[];
  openTasks: OpenTaskOption[];
  disabled: boolean;
}) {
  const ownerName = vendorUsers.find((u) => u.id === edits.ownerId)?.name || null;
  const assigneeName = contacts.find((c) => c.id === edits.assigneeContactId)?.name || null;
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

      <DraftDependenciesField
        items={edits.dependsOn}
        tasks={openTasks}
        disabled={disabled}
        onChange={(dependsOn) => onChange({ dependsOn })}
        describeLink={describeLink}
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

const ghostTitleStyle: CSSProperties = {
  width: "100%",
  padding: 0,
  fontSize: 16,
  background: "transparent",
  color: "var(--text)",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
};

const ghostDescriptionStyle: CSSProperties = {
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
interface SelectPillOption {
  id: number | null;
  label: string | null | undefined;
}

function SelectPill({
  icon,
  label,
  valueLabel,
  options,
  selected,
  onSelect,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  valueLabel: string | null;
  options: SelectPillOption[];
  selected: number | null | undefined;
  onSelect: (id: number | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative" style={{ width: "100%" }}>
      {/* eslint-disable-next-line no-restricted-syntax -- dropdown trigger, becomes Select in slice 3 */}
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
function DueDatePill({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const ref = useRef(null);

  const label = value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div ref={ref} className="relative" style={{ flex: 1, minWidth: 140 }}>
      {/* eslint-disable-next-line no-restricted-syntax -- dropdown trigger, becomes Select in slice 3 */}
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
          onChange={(d: string) => {
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
function PriorityPill({ value, onChange, disabled }: ValueEditorProps<Priority>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const labelMap: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
  const label = labelMap[value as string] || "Priority";

  return (
    <div ref={ref} className="relative" style={{ flex: 1, minWidth: 140 }}>
      {/* eslint-disable-next-line no-restricted-syntax -- dropdown trigger, becomes Select in slice 3 */}
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
          {(["low", "medium", "high"] as const).map((p) => (
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }}>
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "currentColor", flexShrink: 0 }}>
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

/** Bulk-selection toggle, mirroring the Kanban board's CheckboxButton
 *  (TaskCardView): empty circle + ghost check when unselected whose
 *  outline animates to colour on hover, and a filled circle-check when
 *  selected. Uses --action (not --success) since this is a selection
 *  affordance in the inbox, not a "done" state. */
function SelectCheckbox({
  selected,
  onToggle,
  disabled,
}: {
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const strokeColor = hovered && !disabled ? "var(--action)" : "var(--icon-tertiary)";
  return (
    // eslint-disable-next-line no-restricted-syntax -- circle + ghost check, not the square DS Checkbox; a retrofit would change the shape
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

function ConfidencePill({ confidence }: { confidence: string }) {
  const map: Record<string, { dots: string; color: string }> = {
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
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
