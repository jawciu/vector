/**
 * Task dependencies (GAPS-PLAN feature 2): what a task waits on. Either another
 * task on the board, or something that is not a task at all ("platform team
 * sign-off", "security review closes") written as a short text label. A task
 * can have several. Stored in the TaskDependency table.
 *
 * This module is pure (no DB, no AI): the shapes, and the ONE normaliser that
 * turns anything the AI, the inbox editor or an older draft sends into a clean
 * `dependsOn` list. Used by the meeting draft writer, the approve route, the
 * inbox card, lib/db.ts and the eval mapper.
 */

/** One thing a task waits on, as the AI and drafts express it. */
export type DependsOnItem = { taskId: number } | { text: string };

/**
 * GAPS-PLAN feature 3: a draft waiting on another CREATE draft from the same
 * meeting, which has no task yet. The model names it by its short `draftRef`
 * ("d2"); the meeting draft writer binds that to the sibling draft's row id
 * (`draftId`) once every draft of the meeting is written, and snapshots the
 * sibling's title so the link can fall back to a text blocker. Only drafts
 * carry these; a task never does (approval turns them into a task blocker or
 * a text blocker, see lib/draft-links.ts).
 */
export type DraftLinkItem = { draftId?: number; draftRef?: string; title?: string };
/** What a draft's dependsOn holds: board tasks, text, or sibling drafts. */
export type DraftDependsOnItem = DependsOnItem | DraftLinkItem;

export function isDraftLink(item: DraftDependsOnItem): item is DraftLinkItem {
  return !("taskId" in item) && !("text" in item);
}

const DRAFT_REF = /^[A-Za-z0-9_-]{1,12}$/;
/** A usable draftRef ("d1"): short, no spaces. */
export function cleanDraftRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return DRAFT_REF.test(s) ? s : null;
}

/** A stored dependency as the board and drawer receive it. */
export type TaskDependencyView = {
  id: number;
  /** Set for a task blocker. */
  blockedByTask?: { id: number; taskId: string | null; title: string; status: string } | null;
  /** Set for a text blocker. */
  label?: string | null;
  /** ISO timestamp when a text blocker was ticked off. */
  resolvedAt?: string | null;
};

/** Longest text blocker we keep (the database CHECK allows 200). */
export const DEPENDENCY_LABEL_MAX = 200;
/** A draft never carries more than this many dependencies. */
export const MAX_DEPENDENCIES = 10;

/** Trim and collapse whitespace; null when nothing is left. Long labels are cut on a word. */
export function cleanDependencyLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/\s+/g, " ").trim();
  // The old prompt wrote non-task blockers as "Blocked by: X" lines.
  s = s.replace(/^blocked by:?\s*/i, "").trim();
  if (!s) return null;
  if (s.length > DEPENDENCY_LABEL_MAX) {
    const cut = s.slice(0, DEPENDENCY_LABEL_MAX - 1);
    const sp = cut.lastIndexOf(" ");
    s = `${(sp > 40 ? cut.slice(0, sp) : cut).trimEnd()}…`;
  }
  return s;
}

function intOrNull(x: unknown): number | null {
  if (typeof x === "number" && Number.isInteger(x) && x > 0) return x;
  if (typeof x === "string" && /^\d+$/.test(x.trim())) {
    const n = Number(x.trim());
    return n > 0 ? n : null;
  }
  return null;
}

/**
 * Normalise a `dependsOn` value (one object or a list) plus the legacy
 * single `blockedByTaskId`, into a de-duplicated list. Order is kept, the
 * legacy task first. Malformed entries are dropped. Each item is `{ taskId }`
 * or `{ text }`; an item carrying both keeps the task (text is then a
 * description of the same blocker). Text that matches another text
 * case-insensitively is a duplicate.
 */
export function normaliseDependsOn(raw: unknown, legacyBlockedByTaskId?: unknown): DependsOnItem[] {
  return normalise(raw, legacyBlockedByTaskId, false) as DependsOnItem[];
}

/**
 * normaliseDependsOn for a draft's list: the same, but sibling-draft links
 * (`{ draftId }` and/or `{ draftRef }`, with an optional `title`) are kept,
 * de-duplicated on the draft. A link that names neither is dropped.
 */
export function normaliseDraftDependsOn(raw: unknown, legacyBlockedByTaskId?: unknown): DraftDependsOnItem[] {
  return normalise(raw, legacyBlockedByTaskId, true);
}

function normalise(raw: unknown, legacyBlockedByTaskId: unknown, keepLinks: boolean): DraftDependsOnItem[] {
  const out: DraftDependsOnItem[] = [];
  const seenTasks = new Set<number>();
  const seenText = new Set<string>();
  const seenLinks = new Set<string>();
  const push = (item: DraftDependsOnItem) => {
    if (out.length >= MAX_DEPENDENCIES) return;
    if ("taskId" in item) {
      if (seenTasks.has(item.taskId)) return;
      seenTasks.add(item.taskId);
    } else if ("text" in item) {
      const key = item.text.toLowerCase();
      if (seenText.has(key)) return;
      seenText.add(key);
    } else {
      const key = item.draftId != null ? `id:${item.draftId}` : `ref:${item.draftRef}`;
      if (seenLinks.has(key)) return;
      seenLinks.add(key);
    }
    out.push(item);
  };
  const legacy = intOrNull(legacyBlockedByTaskId);
  if (legacy != null) push({ taskId: legacy });
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  for (const entry of list) {
    if (typeof entry === "string") {
      const text = cleanDependencyLabel(entry);
      if (text) push({ text });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const taskId = intOrNull(e.taskId);
    if (taskId != null) { push({ taskId }); continue; }
    if (e.draftId !== undefined || e.draftRef !== undefined) {
      // A sibling-draft link. Kept on drafts only; elsewhere it is not a
      // dependency a task can have, so it is dropped (never turned into text
      // here: the approve route decides that, knowing the sibling's fate).
      if (!keepLinks) continue;
      const draftId = intOrNull(e.draftId);
      const draftRef = cleanDraftRef(e.draftRef);
      if (draftId == null && draftRef == null) continue;
      const title = cleanDependencyLabel(e.title);
      push({
        ...(draftId != null && { draftId }),
        ...(draftRef != null && { draftRef }),
        ...(title && { title }),
      });
      continue;
    }
    const text = cleanDependencyLabel(e.text ?? e.label);
    if (text) push({ text });
  }
  return out;
}

/** Split a list into the task ids and the text labels. */
export function splitDependsOn(items: DependsOnItem[]): { taskIds: number[]; texts: string[] } {
  const taskIds: number[] = [];
  const texts: string[] = [];
  for (const i of items) {
    if ("taskId" in i) taskIds.push(i.taskId);
    else texts.push(i.text);
  }
  return { taskIds, texts };
}

/**
 * Drop task blockers outside `validTaskIds` (ids the model was not shown, or
 * that are no longer open). Returns what was kept and what was dropped, so the
 * caller can log it. Text items and sibling-draft links always stay.
 */
export function filterDependsOn<T extends DraftDependsOnItem>(items: T[], validTaskIds: Set<number>): { kept: T[]; dropped: number[] } {
  const kept: T[] = [];
  const dropped: number[] = [];
  for (const i of items) {
    if ("taskId" in i && !validTaskIds.has(i.taskId)) dropped.push(i.taskId);
    else kept.push(i);
  }
  return { kept, dropped };
}

/** Whether a stored dependency still holds the task up. */
export function isDependencyOpen(dep: { blockedByTask?: { status: string } | null; label?: string | null; resolvedAt?: string | Date | null }): boolean {
  if (dep.blockedByTask) return dep.blockedByTask.status !== "Done";
  if (dep.label) return !dep.resolvedAt;
  return false;
}

/**
 * A stored create_task draft's dependencies. A `dependsOn` list (written by
 * the AI since feature 2, or by the inbox editor) is the whole truth, even
 * when empty; only a draft without one falls back to its legacy single
 * `blockedByTaskId`. So removing a blocker in the editor stays removed.
 * Sibling-draft links (feature 3) are kept.
 */
export function draftDependsOn(payload: unknown): DraftDependsOnItem[] {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (Array.isArray(p.dependsOn)) return normaliseDraftDependsOn(p.dependsOn);
  return normaliseDraftDependsOn(p.dependsOn, p.blockedByTaskId);
}
