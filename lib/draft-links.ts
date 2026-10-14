/**
 * Dependencies between drafts from the same meeting (GAPS-PLAN feature 3).
 *
 * One meeting can propose "add the metrics block" and "migrate the dashboards
 * (needs the metrics block)". Neither is a task yet, so the second cannot
 * point at a task id. The flow:
 *
 * 1. Model output. Every create_task_draft carries a short `draftRef` ("d1").
 *    Any draft's dependsOn (a create's, or an existing-task update's
 *    `changes.dependsOn`) may name `{ draftRef }`. `planDraftRefs` validates
 *    them before anything is stored: an unknown ref falls back to a text
 *    blocker with the best label available (or is dropped when there is
 *    none), a self-reference is dropped, and a ref that would close a loop
 *    between this meeting's drafts becomes a text blocker. Each surviving link
 *    is `{ draftRef, title }` (title = the sibling's proposed title).
 *
 * 2. Storage (lib/db.ts createMeetingDrafts). All of a meeting's drafts are
 *    written in ONE transaction, then every `{ draftRef }` link is bound to the
 *    sibling's row id: `{ draftId, draftRef, title }` (`bindDraftLinks`). Two
 *    passes because a row id only exists once the row is written.
 *
 * 3. Approval (lib/db.ts applyDraftApproval). A link resolves by the sibling's
 *    state at that moment (`classifyDraftLink`):
 *      - sibling applied, its task still open → a task blocker on that task;
 *      - sibling still pending → a TEXT blocker with the sibling's title (the
 *        placeholder), and the link is recorded as pending on this draft's
 *        `payload.draftLinks` with the placeholder row's id. When the sibling
 *        is approved later, that placeholder row is turned into a task blocker
 *        on the sibling's new task, once (`state` flips to "linked");
 *      - sibling rejected → a text blocker with its title, so the blocker is
 *        not silently lost;
 *      - sibling applied but its task is Done or deleted → nothing (the same
 *        rule as a board blocker that is done or gone).
 *    So approving in order, out of order, or one after another in a bulk
 *    action all end with the same links, and a pending link is visible on the
 *    board meanwhile (as text) rather than missing.
 *
 * Pure: no DB, no AI.
 */

import {
  cleanDependencyLabel,
  cleanDraftRef,
  isDraftLink,
  normaliseDraftDependsOn,
  type DependsOnItem,
  type DraftDependsOnItem,
  type DraftLinkItem,
} from "./task-dependencies";

// ---------------------------------------------------------------------------
// 1. Model output → validated refs
// ---------------------------------------------------------------------------

/** A Pass 2 tool call, as far as draft refs are concerned. */
export type RefPlanCall = { tool: string; input: Record<string, unknown> | null | undefined };

export type DraftRefPlan = {
  /** Per call: the create draft's ref, null for any other tool. */
  refs: (string | null)[];
  /**
   * Per call: the call's dependsOn with draft refs validated (create: the
   * input's `dependsOn`; existing-task update: `changes.dependsOn`), or
   * undefined when the call had none. Other entries pass through untouched;
   * the usual normaliser still runs on them afterwards.
   */
  dependsOn: (unknown[] | undefined)[];
  /** One line per ref that was assigned, dropped or downgraded to text. */
  log: string[];
};

const CREATE = "create_task_draft";
const UPDATE = "match_to_existing_task_draft";

function rawDeps(call: RefPlanCall): unknown {
  const input = call.input ?? {};
  if (call.tool === CREATE) return input.dependsOn;
  if (call.tool === UPDATE) {
    const changes = input.changes;
    return changes && typeof changes === "object" ? (changes as Record<string, unknown>).dependsOn : undefined;
  }
  return undefined;
}

const asList = (x: unknown): unknown[] =>
  Array.isArray(x) ? x : x && typeof x === "object" ? [x] : [];

/** An entry that names a sibling draft rather than a board task. */
function refOf(entry: unknown): string | null | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const e = entry as Record<string, unknown>;
  if (e.draftRef === undefined) return undefined;
  // A valid task id wins (the normaliser keeps the task, as for { taskId, text }).
  if (typeof e.taskId === "number" || (typeof e.taskId === "string" && /^\d+$/.test(e.taskId))) return undefined;
  return cleanDraftRef(e.draftRef) ?? null;
}

/**
 * Assign / validate draft refs for one Pass 2 response and rewrite every
 * `{ draftRef }` dependency. See the module comment, step 1.
 */
export function planDraftRefs(calls: RefPlanCall[]): DraftRefPlan {
  const log: string[] = [];
  const refs: (string | null)[] = calls.map(() => null);
  const byRef = new Map<string, { index: number; title: string }>();

  // Refs the model gave, first come first served; the rest get the next free "dN".
  const wanted = calls.map((c) => (c.tool === CREATE ? cleanDraftRef(c.input?.draftRef) : null));
  calls.forEach((c, i) => {
    if (c.tool !== CREATE) return;
    const r = wanted[i];
    if (r && !byRef.has(r)) {
      refs[i] = r;
      byRef.set(r, { index: i, title: titleOf(c) });
    }
  });
  let n = 1;
  calls.forEach((c, i) => {
    if (c.tool !== CREATE || refs[i]) return;
    while (byRef.has(`d${n}`)) n++;
    const r = `d${n}`;
    const given = c.input?.draftRef;
    if (given !== undefined) log.push(`call ${i}: draftRef ${JSON.stringify(given)} unusable or taken, assigned ${r}`);
    refs[i] = r;
    byRef.set(r, { index: i, title: titleOf(c) });
  });

  // Graph for the loop check: create call i is node "c<i>"; an update is the
  // node of the task it targets; a board task blocker is "t<id>".
  const node = (i: number): string => {
    const c = calls[i];
    if (c.tool === UPDATE) return `t${Number(c.input?.taskId)}`;
    return `c${i}`;
  };
  const edges = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(a)!.add(b);
  };
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === to) return true;
      for (const y of edges.get(x) ?? []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return false;
  };
  calls.forEach((c, i) => {
    for (const e of asList(rawDeps(c))) {
      if (refOf(e) !== undefined || !e || typeof e !== "object") continue;
      const t = Number((e as Record<string, unknown>).taskId);
      if (Number.isInteger(t) && t > 0) addEdge(node(i), `t${t}`);
    }
  });

  const dependsOn = calls.map((c, i): unknown[] | undefined => {
    const raw = rawDeps(c);
    if (raw === undefined) return undefined;
    const out: unknown[] = [];
    for (const e of asList(raw)) {
      const r = refOf(e);
      if (r === undefined) { out.push(e); continue; }
      const target = r != null ? byRef.get(r) ?? byRef.get(r.toLowerCase()) : undefined;
      if (!target) {
        const ent = e as Record<string, unknown>;
        const label = cleanDependencyLabel(ent.text ?? ent.title ?? ent.label);
        if (label) {
          out.push({ text: label });
          log.push(`call ${i}: unknown draftRef ${JSON.stringify(ent.draftRef)}, kept as text "${label}"`);
        } else {
          log.push(`call ${i}: unknown draftRef ${JSON.stringify(ent.draftRef)} with no label, dropped`);
        }
        continue;
      }
      if (target.index === i) {
        log.push(`call ${i}: draft depends on itself (${r}), dropped`);
        continue;
      }
      const from = node(i);
      const to = `c${target.index}`;
      if (reaches(to, from)) {
        out.push({ text: target.title });
        log.push(`call ${i}: draftRef ${r} would make a loop, kept as text "${target.title}"`);
        continue;
      }
      addEdge(from, to);
      out.push({ draftRef: refs[target.index], title: target.title });
    }
    return out;
  });

  return { refs, dependsOn, log };
}

function titleOf(c: RefPlanCall): string {
  return cleanDependencyLabel(c.input?.title) ?? "Another task from this meeting";
}

/**
 * Bind `{ draftRef }` links to row ids once the meeting's drafts are written.
 * A ref with no row (its draft was not stored, e.g. skipped as invalid) falls
 * back to a text blocker with its title.
 */
export function bindDraftLinks(items: DraftDependsOnItem[], idByRef: Map<string, number>, selfId?: number): DraftDependsOnItem[] {
  const out: DraftDependsOnItem[] = [];
  for (const item of items) {
    if (!isDraftLink(item) || item.draftId != null) { out.push(item); continue; }
    const id = item.draftRef != null ? idByRef.get(item.draftRef) : undefined;
    if (id != null && id !== selfId) out.push({ draftId: id, draftRef: item.draftRef, ...(item.title && { title: item.title }) });
    else if (id == null && item.title) out.push({ text: item.title });
  }
  return out;
}

/**
 * A stored draft payload with its `{ draftRef }` links bound to row ids
 * (create: `dependsOn`; update: `changes.dependsOn`). Null when it has
 * nothing to bind, so the caller can skip the write.
 */
export function bindPayloadLinks(
  payload: Record<string, unknown>,
  idByRef: Map<string, number>,
  selfId: number
): Record<string, unknown> | null {
  const changes = payload.changes && typeof payload.changes === "object" && !Array.isArray(payload.changes)
    ? (payload.changes as Record<string, unknown>)
    : null;
  const where = Array.isArray(payload.dependsOn) ? "top" : changes && Array.isArray(changes.dependsOn) ? "changes" : null;
  if (!where) return null;
  const list = normaliseDraftDependsOn(where === "top" ? payload.dependsOn : changes!.dependsOn);
  if (!hasUnboundLinks(list)) return null;
  const bound = bindDraftLinks(list, idByRef, selfId);
  if (where === "top") {
    const next = { ...payload };
    if (bound.length > 0) next.dependsOn = bound;
    else delete next.dependsOn;
    return next;
  }
  const nextChanges = { ...changes! };
  if (bound.length > 0) nextChanges.dependsOn = bound;
  else delete nextChanges.dependsOn;
  return { ...payload, changes: nextChanges };
}

/** Whether a dependsOn list still holds a link that needs binding. */
export function hasUnboundLinks(items: DraftDependsOnItem[]): boolean {
  return items.some((i) => isDraftLink(i) && i.draftId == null);
}

// ---------------------------------------------------------------------------
// 3. Approval
// ---------------------------------------------------------------------------

/**
 * What became of one draft link on an applied draft, stored on its payload as
 * `draftLinks`:
 *   linked       a task blocker on the sibling's task exists
 *   pending      the sibling is still pending: a text placeholder stands in
 *                (`dependencyId`) until the sibling is approved
 *   kept_as_text the sibling was rejected (or the link could not become a task
 *                blocker, see `reason`): the text blocker stays
 *   skipped      the sibling's task is Done or deleted: nothing was added
 *   removed      the placeholder was deleted by hand before the sibling was
 *                approved: left removed
 */
export type DraftLinkState = "linked" | "pending" | "kept_as_text" | "skipped" | "removed";

export type AppliedDraftLink = {
  draftId: number;
  title: string;
  state: DraftLinkState;
  /** The TaskDependency row standing for the link (text placeholder or task blocker). */
  dependencyId?: number | null;
  /** The sibling's task, once linked. */
  blockedByTaskId?: number | null;
  reason?: string;
};

/** A sibling draft as approval sees it. */
export type SiblingDraft = {
  id: number;
  status: string;
  onboardingId: number;
  sourceEventId: number | null;
  title: string | null;
  /** The task it created (applied drafts), null if gone. */
  appliedTask: { id: number; status: string; onboardingId: number } | null;
};

export const FALLBACK_LINK_TITLE = "Another task from this meeting";

/** The label a link falls back to: the sibling's current title, else the snapshot. */
export function linkTitle(link: DraftLinkItem, sibling?: { title: string | null } | null): string {
  return cleanDependencyLabel(sibling?.title) ?? cleanDependencyLabel(link.title) ?? FALLBACK_LINK_TITLE;
}

/**
 * How one link resolves at approval. `dep` is what to add to the task (null =
 * nothing). A link to a draft outside this meeting / onboarding is treated as
 * a plain text blocker: links are only honoured between siblings.
 */
export function classifyDraftLink(
  link: DraftLinkItem,
  sibling: SiblingDraft | null | undefined,
  self: { id: number; onboardingId: number; sourceEventId: number | null }
): { dep: DependsOnItem | null; state: DraftLinkState; title: string; draftId: number | null; reason?: string } {
  const title = linkTitle(link, sibling);
  const draftId = link.draftId ?? null;
  if (draftId != null && draftId === self.id) return { dep: null, state: "skipped", title, draftId, reason: "self" };
  const sameMeeting =
    !!sibling && sibling.onboardingId === self.onboardingId && sibling.sourceEventId != null && sibling.sourceEventId === self.sourceEventId;
  if (draftId == null || !sibling || !sameMeeting) {
    return { dep: { text: title }, state: "kept_as_text", title, draftId, reason: "not a draft from this meeting" };
  }
  if (sibling.status === "pending") return { dep: { text: title }, state: "pending", title, draftId };
  if (sibling.status === "applied") {
    const t = sibling.appliedTask;
    if (!t || t.onboardingId !== self.onboardingId) return { dep: null, state: "skipped", title, draftId, reason: "its task was deleted" };
    if (t.status === "Done") return { dep: null, state: "skipped", title, draftId, reason: "its task is done" };
    return { dep: { taskId: t.id }, state: "linked", title, draftId };
  }
  // rejected (or any other resolved state): keep the blocker as text.
  return { dep: { text: title }, state: "kept_as_text", title, draftId, reason: sibling.status === "rejected" ? "rejected" : sibling.status };
}

/** Read a stored payload's draftLinks (written at approval). */
export function readDraftLinks(payload: unknown): AppliedDraftLink[] {
  const raw = (payload as { draftLinks?: unknown } | null)?.draftLinks;
  if (!Array.isArray(raw)) return [];
  const states: DraftLinkState[] = ["linked", "pending", "kept_as_text", "skipped", "removed"];
  return raw.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const x = r as Record<string, unknown>;
    if (typeof x.draftId !== "number" || !states.includes(x.state as DraftLinkState)) return [];
    return [{
      draftId: x.draftId,
      title: typeof x.title === "string" ? x.title : FALLBACK_LINK_TITLE,
      state: x.state as DraftLinkState,
      dependencyId: typeof x.dependencyId === "number" ? x.dependencyId : null,
      blockedByTaskId: typeof x.blockedByTaskId === "number" ? x.blockedByTaskId : null,
      ...(typeof x.reason === "string" && { reason: x.reason }),
    }];
  });
}

/** The draft links in a payload's dependsOn (create) or changes.dependsOn (update). */
export function payloadDraftLinks(payload: unknown): DraftLinkItem[] {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const changes = p.changes && typeof p.changes === "object" ? (p.changes as Record<string, unknown>) : null;
  const list = asList(p.dependsOn ?? changes?.dependsOn);
  return list.filter((e): e is DraftLinkItem => {
    if (!e || typeof e !== "object") return false;
    const x = e as Record<string, unknown>;
    return typeof x.draftId === "number" && x.taskId === undefined;
  });
}

// ---------------------------------------------------------------------------
// Inbox display
// ---------------------------------------------------------------------------

/** What the inbox knows about a sibling draft (hydrated by listPendingAIChanges). */
export type LinkedDraftInfo = {
  id: number;
  status: string;
  title: string | null;
  /** "RAY-12" when it was applied and its task still exists. */
  taskCode: string | null;
};

/**
 * The short state shown next to "Depends on: <title> (also in this meeting)".
 * For a pending draft: what approving it now would do. For an applied one:
 * what happened (its stored `draftLinks` entry wins).
 */
export function draftLinkStatus(
  sibling: LinkedDraftInfo | null | undefined,
  applied?: AppliedDraftLink | null
): { label: string; tone: "pending" | "ok" | "warn" | "muted" } {
  if (applied) {
    if (applied.state === "linked") return { label: sibling?.taskCode ? `linked to ${sibling.taskCode}` : "linked", tone: "ok" };
    if (applied.state === "pending") {
      if (sibling?.status === "rejected") return { label: "rejected, kept as a text blocker", tone: "warn" };
      return { label: "links when that draft is approved", tone: "pending" };
    }
    if (applied.state === "kept_as_text") return { label: "kept as a text blocker", tone: "warn" };
    if (applied.state === "removed") return { label: "removed by hand", tone: "muted" };
    return { label: applied.reason === "its task is done" ? "already done" : "not linked", tone: "muted" };
  }
  if (!sibling) return { label: "kept as a text blocker", tone: "warn" };
  if (sibling.status === "pending") return { label: "pending: links once both are approved", tone: "pending" };
  if (sibling.status === "applied") {
    return sibling.taskCode ? { label: `created as ${sibling.taskCode}, will link`, tone: "ok" } : { label: "its task is gone, will be skipped", tone: "muted" };
  }
  return { label: "rejected, kept as a text blocker", tone: "warn" };
}
