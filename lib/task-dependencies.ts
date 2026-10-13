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
  const out: DependsOnItem[] = [];
  const seenTasks = new Set<number>();
  const seenText = new Set<string>();
  const push = (item: DependsOnItem) => {
    if (out.length >= MAX_DEPENDENCIES) return;
    if ("taskId" in item) {
      if (seenTasks.has(item.taskId)) return;
      seenTasks.add(item.taskId);
    } else {
      const key = item.text.toLowerCase();
      if (seenText.has(key)) return;
      seenText.add(key);
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
 * caller can log it. Text items always stay.
 */
export function filterDependsOn(items: DependsOnItem[], validTaskIds: Set<number>): { kept: DependsOnItem[]; dropped: number[] } {
  const kept: DependsOnItem[] = [];
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
