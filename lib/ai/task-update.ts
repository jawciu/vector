/**
 * The shape of an "update an existing task" draft (PendingAIChange.action =
 * "match_existing"), and the ONE place that turns any stored or posted form
 * of it into that shape.
 *
 * Current shape (written by lib/integrations/miniti.ts since GAPS-PLAN
 * feature 1):
 *
 *   { taskId, action, changes: { ownerId?, assigneeContactId?, priority?,
 *     dueDate?, appendNotes?, dependsOn? }, sourceQuote, confidence }
 *
 * `dependsOn` (GAPS-PLAN feature 2) is what the task should additionally wait
 * on: `[{ taskId } | { text }]`, normalised by lib/task-dependencies.ts.
 *
 * Legacy shape (older rows, and the model if it ever falls back to it): one
 * sub-action per draft, `action` = "reassign" | "reprioritise" |
 * "update_due_date" with `newPriority` / `newDueDate` alongside, and for a
 * reassign the target only arriving later as `newOwnerId` /
 * `newAssigneeContactId` overrides from the inbox editor.
 *
 * `action` is kept on the normalised payload because older readers (the
 * draft icon, the drawer, scripts) branch on it. It is derived from
 * `changes`: the single legacy sub-action when only one kind of change is
 * present, "update" when several are, "add_notes" for notes only.
 *
 * Pure: no DB, no AI. Used by the miniti draft writer, the approve route and
 * the inbox card.
 */

import { normaliseDependsOn, type DependsOnItem } from "@/lib/task-dependencies";

export const TASK_UPDATE_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskUpdatePriority = (typeof TASK_UPDATE_PRIORITIES)[number];

export type TaskUpdateChanges = {
  /** Vendor owner. `null` = clear the owner. */
  ownerId?: number | null;
  /** Customer-side assignee. `null` = clear the assignee. */
  assigneeContactId?: number | null;
  priority?: TaskUpdatePriority;
  /** ISO date, YYYY-MM-DD. `null` = remove the due date (absent = leave it). */
  dueDate?: string | null;
  /** Text to append to the task's notes (never overwrites). */
  appendNotes?: string;
  /** Dependencies to ADD to the task (existing ones stay). */
  dependsOn?: DependsOnItem[];
};

export type TaskUpdateSubAction =
  | "reassign"
  | "reprioritise"
  | "update_due_date"
  | "add_notes"
  | "add_dependency"
  | "update";

/** Sub-actions the old one-change-per-draft tool emitted. */
export const LEGACY_SUB_ACTIONS = ["reassign", "reprioritise", "update_due_date"] as const;

export type NormalisedTaskUpdate = {
  /** Derived from `changes`; legacy value kept when `changes` is empty (e.g. an un-targeted reassign). */
  action: string | null;
  changes: TaskUpdateChanges;
};

const CHANGE_KEYS = ["ownerId", "assigneeContactId", "priority", "dueDate", "appendNotes", "dependsOn"] as const;
/** Accepted on input and folded into dependsOn (the model's or an older editor's single blocker). */
const LEGACY_CHANGE_KEYS = ["blockedByTaskId"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTaskUpdatePriority(value: unknown): value is TaskUpdatePriority {
  return typeof value === "string" && (TASK_UPDATE_PRIORITIES as readonly string[]).includes(value);
}

/** Id from model or request JSON: a number, a numeric string, or null (explicit clear). Undefined = absent / unusable. */
function idOrNull(x: unknown): number | null | undefined {
  if (x === null) return null;
  if (typeof x === "number" && Number.isInteger(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isInteger(Number(x))) return Number(x);
  return undefined;
}

/**
 * Keep only well-formed change fields. Shape checks only (types, enum, ISO
 * date); whether an id exists on this onboarding is the caller's job, since
 * that needs the database.
 */
export function sanitiseChanges(raw: unknown): TaskUpdateChanges {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: TaskUpdateChanges = {};
  const ownerId = idOrNull(r.ownerId);
  if (ownerId !== undefined) out.ownerId = ownerId;
  const contactId = idOrNull(r.assigneeContactId);
  if (contactId !== undefined) out.assigneeContactId = contactId;
  if (isTaskUpdatePriority(r.priority)) out.priority = r.priority;
  // The model and the date picker both give YYYY-MM-DD; tolerate a full
  // timestamp by cutting it down.
  if (r.dueDate === null) out.dueDate = null;
  else if (typeof r.dueDate === "string" && isIsoDate(r.dueDate.slice(0, 10))) out.dueDate = r.dueDate.slice(0, 10);
  if (typeof r.appendNotes === "string" && r.appendNotes.trim() !== "") out.appendNotes = r.appendNotes.trim();
  if (r.dependsOn !== undefined || r.blockedByTaskId !== undefined) {
    const deps = normaliseDependsOn(r.dependsOn, r.blockedByTaskId);
    if (deps.length > 0) out.dependsOn = deps;
  }
  return out;
}

/** Fields present on a raw `changes` object that `sanitiseChanges` would drop (wrong type, bad enum, bad date, unknown key). */
export function invalidChangeFields(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["changes"];
  const kept = sanitiseChanges(raw);
  return Object.keys(raw as Record<string, unknown>).filter((k) => {
    const v = (raw as Record<string, unknown>)[k];
    if ((LEGACY_CHANGE_KEYS as readonly string[]).includes(k)) return v !== null && kept.dependsOn === undefined;
    if (!(CHANGE_KEYS as readonly string[]).includes(k)) return true;
    // A blank note is "no note", not an error.
    if (k === "appendNotes" && typeof v === "string") return false;
    // An empty list is "no dependencies to add", not an error.
    if (k === "dependsOn" && Array.isArray(v) && v.length === 0) return false;
    return !(k in kept);
  });
}

/** The changes a legacy single-action payload (or legacy override body) expresses. */
function legacyChanges(p: Record<string, unknown>, subAction: unknown): TaskUpdateChanges {
  if (subAction === "reprioritise") return sanitiseChanges({ priority: p.newPriority });
  if (subAction === "update_due_date") return sanitiseChanges({ dueDate: p.newDueDate });
  if (subAction === "reassign") {
    return sanitiseChanges({
      ...(p.newOwnerId !== undefined && { ownerId: p.newOwnerId }),
      ...(p.newAssigneeContactId !== undefined && { assigneeContactId: p.newAssigneeContactId }),
    });
  }
  return {};
}

/** The `action` value that describes a set of changes. */
export function subActionFor(changes: TaskUpdateChanges, fallback: string | null = null): string | null {
  const kinds = new Set<string>();
  for (const k of CHANGE_KEYS) {
    if (changes[k] === undefined) continue;
    kinds.add(k === "ownerId" || k === "assigneeContactId" ? "reassign"
      : k === "priority" ? "reprioritise"
      : k === "dueDate" ? "update_due_date"
      : k === "dependsOn" ? "add_dependency"
      : "add_notes");
  }
  if (kinds.size === 0) return fallback;
  if (kinds.size === 1) return [...kinds][0];
  return "update";
}

export function hasChanges(changes: TaskUpdateChanges): boolean {
  return CHANGE_KEYS.some((k) => changes[k] !== undefined);
}

/**
 * Normalise a stored match_existing payload. `changes` (current shape) wins;
 * legacy fields fill in only what `changes` does not already say.
 */
export function normaliseTaskUpdate(payload: unknown): NormalisedTaskUpdate {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const legacyAction = typeof p.action === "string" ? p.action : null;
  const changes: TaskUpdateChanges = { ...legacyChanges(p, legacyAction), ...sanitiseChanges(p.changes) };
  return { action: subActionFor(changes, legacyAction), changes };
}

/**
 * Apply the inbox editor's overrides to a stored payload.
 *
 * - `overrides.changes` (the current editor) is the complete edited set and
 *   REPLACES the stored changes, so removing a field in the editor removes
 *   the change.
 * - Legacy override keys (`newDueDate`, `newPriority`, `newOwnerId`,
 *   `newAssigneeContactId`) are read against the stored sub-action and
 *   layered on top, as the old editor's overrides were.
 */
export function applyTaskUpdateOverrides(payload: unknown, overrides: unknown): NormalisedTaskUpdate {
  const base = normaliseTaskUpdate(payload);
  const o = (overrides && typeof overrides === "object" ? overrides : {}) as Record<string, unknown>;
  if (o.changes !== undefined) {
    const changes = sanitiseChanges(o.changes);
    return { action: subActionFor(changes, base.action), changes };
  }
  const legacyAction = (payload as { action?: unknown } | null)?.action;
  const changes = { ...base.changes, ...legacyChanges(o, legacyAction) };
  return { action: subActionFor(changes, base.action), changes };
}

/**
 * Build the payload to store for a match_existing tool call: legacy fields
 * folded into `changes`, `action` derived, the old one-change fields dropped
 * so `changes` is the single source of truth.
 */
export function toStoredTaskUpdatePayload<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const { action, changes } = normaliseTaskUpdate(input);
  const rest: Record<string, unknown> = { ...input };
  delete rest.newPriority;
  delete rest.newDueDate;
  delete rest.newOwnerId;
  delete rest.newAssigneeContactId;
  return { ...rest, action, changes };
}

/**
 * Everything the draft writer does to a match_existing tool call before it
 * is stored: normalise (toStoredTaskUpdatePayload), then drop an owner or
 * assignee id that is not in the context the model was shown. Returns
 * `payload: null` when nothing is left to change; a legacy reassign with no
 * target is the exception (it is a flag-only draft the reviewer completes).
 */
export function prepareStoredTaskUpdate(
  input: Record<string, unknown>,
  valid: { vendorUserIds: Set<number>; contactIds: Set<number>; openTaskIds?: Set<number> }
): { payload: Record<string, unknown> | null; dropped: string[] } {
  const stored = toStoredTaskUpdatePayload(input);
  const changes = { ...(stored.changes as TaskUpdateChanges) };
  const dropped: string[] = [];
  if (changes.ownerId != null && !valid.vendorUserIds.has(changes.ownerId)) {
    dropped.push(`ownerId=${changes.ownerId}`);
    delete changes.ownerId;
  }
  if (changes.assigneeContactId != null && !valid.contactIds.has(changes.assigneeContactId)) {
    dropped.push(`assigneeContactId=${changes.assigneeContactId}`);
    delete changes.assigneeContactId;
  }
  if (changes.dependsOn) {
    // A blocker must be another open task the model was shown.
    const target = typeof input.taskId === "number" ? input.taskId : Number(input.taskId);
    const kept = changes.dependsOn.filter((d) => {
      if (!("taskId" in d)) return true;
      const ok = d.taskId !== target && (!valid.openTaskIds || valid.openTaskIds.has(d.taskId));
      if (!ok) dropped.push(`dependsOn.taskId=${d.taskId}`);
      return ok;
    });
    if (kept.length > 0) changes.dependsOn = kept;
    else delete changes.dependsOn;
  }
  const legacyFlagOnly = input.changes === undefined && input.action === "reassign";
  if (!hasChanges(changes) && !legacyFlagOnly) return { payload: null, dropped };
  const action = subActionFor(changes, legacyFlagOnly ? "reassign" : null);
  return { payload: { ...stored, action, changes }, dropped };
}

/**
 * Where an appended note came from: the meeting's own calendar day and a
 * short label ("call with Acme"). Stored on the draft payload when the draft
 * is created, so the stamp reads as when it was agreed, not when approved.
 */
export type NoteSource = { date: string; label: string };

const LABEL_MAX = 40;

/** The calendar day of a meeting in Europe/London (the team's day): a
 *  meeting at 00:30 UK time sent as 23:30Z is stamped with the UK day, not
 *  the UTC one. A bare YYYY-MM-DD is taken as it is. */
export function meetingDay(date: unknown): string | null {
  if (typeof date !== "string") return null;
  if (isIsoDate(date)) return date;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(date)) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : londonDate(d);
}

/** "call with <Company>", or the meeting title when there is no company. Kept short. */
export function noteSourceFor(
  meeting: { date?: unknown; title?: unknown } | null | undefined,
  companyName?: string | null
): NoteSource | null {
  const date = meetingDay(meeting?.date);
  if (!date) return null;
  const title = typeof meeting?.title === "string" ? meeting.title.trim() : "";
  let label = companyName?.trim() ? `call with ${companyName.trim()}` : title;
  if (!label) label = "call";
  if (label.length > LABEL_MAX) label = `${label.slice(0, LABEL_MAX - 1).trimEnd()}…`;
  return { date, label };
}

/** A stored payload's noteSource, if well formed. */
export function readNoteSource(raw: unknown): NoteSource | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isIsoDate(r.date) || typeof r.label !== "string" || !r.label.trim()) return null;
  return { date: r.date, label: r.label.trim() };
}

/** Today's date in Europe/London (YYYY-MM-DD): the fallback stamp for drafts with no meeting. */
export function londonDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The text inside the note's brackets: "2026-06-18, call with Acme", or the London date. */
export function noteStamp(source: NoteSource | null, now: Date): string {
  return source ? `${source.date}, ${source.label}` : londonDate(now);
}

/** Append `text` to `existing` notes on its own line, prefixed `[stamp]`. Never overwrites. */
export function appendDatedNote(existing: string | null | undefined, text: string, stamp: string): string {
  const line = `[${stamp}] ${text.trim()}`;
  const before = (existing ?? "").replace(/\s+$/, "");
  return before ? `${before}\n${line}` : line;
}

/** Shown on the card and returned by the approve route when a draft's owner is gone. */
export function staleOwnerMessage(name: string | null | undefined): string {
  return `${name?.trim() || "The proposed owner"} is no longer in the workspace: pick a new owner or leave unassigned`;
}

/** Same for a customer contact who is no longer on the onboarding. */
export function staleContactMessage(name: string | null | undefined): string {
  return `${name?.trim() || "The proposed assignee"} is no longer on this onboarding: pick a new assignee or leave unassigned`;
}
