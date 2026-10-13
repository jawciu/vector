/**
 * Raw pipeline output → what the scorer sees.
 *
 * The runner stores, per case, everything the pipeline produced in raw form
 * (draft rows with their full payloads, Pass 2's full tool calls, Pass 1's
 * extraction, the match result) plus the id → ref / id → name maps from
 * seeding. `buildActual` turns that into a `CaseActual` with ids mapped back
 * to the answer key's vocabulary.
 *
 * Pure (no DB, no AI), so `run-golden.ts --rescore <runfile>` can re-map and
 * re-score a stored run for free after the scorer or the answer key changes.
 */

import type { CaseActual, GoldenCase, PhaseActual, Proposal, RawCall } from "./types";

export type DraftRow = {
  id: number;
  action: string;
  payload: Record<string, unknown>;
  sourceQuote: string | null;
  confidence: string;
};
export type OutputCall = { tool: string; input?: Record<string, unknown>; id?: string };

/** Serialisable copies of the seed maps (JSON object keys are strings). */
export type RawMaps = {
  companyPrefixByOnboardingId: Record<string, string>;
  onboardingIdByPrefix: Record<string, number>;
  vendorNameById: Record<string, string>;
  contactNameById: Record<string, string>;
  refByTaskId: Record<string, string>;
};

export type RawPhase = {
  drafts: DraftRow[];
  /** ExternalEvent.orchestratorOutput: Pass 2's tool calls, full inputs. */
  orchestratorOutput: OutputCall[] | null;
  /** ExternalEvent.orchestratorExtraction: Pass 1's facts. */
  orchestratorExtraction: unknown;
};

export type RawCase = {
  maps: RawMaps;
  match: { onboardingId: number | null; ambiguous: boolean; matchedBy: string | null; candidates?: unknown[] };
  initial: RawPhase;
  /** Ambiguous cases with afterAssign. `assigned` false: it was (wrongly) matched, so no human could assign it. */
  afterAssign?: RawPhase & { companyPrefix: string; assigned: boolean };
  redelivery?: { deduped: boolean; newDrafts: number };
  error: string | null;
};

export function mapsToRaw(maps: {
  companyPrefixByOnboardingId: Map<number, string>;
  onboardingIdByPrefix: Map<string, number>;
  vendorNameById: Map<number, string>;
  contactNameById: Map<number, string>;
  refByTaskId: Map<number, string>;
}): RawMaps {
  const obj = <K, V>(m: Map<K, V>) => Object.fromEntries([...m].map(([k, v]) => [String(k), v]));
  return {
    companyPrefixByOnboardingId: obj(maps.companyPrefixByOnboardingId),
    onboardingIdByPrefix: obj(maps.onboardingIdByPrefix),
    vendorNameById: obj(maps.vendorNameById),
    contactNameById: obj(maps.contactNameById),
    refByTaskId: obj(maps.refByTaskId),
  };
}

const num = (x: unknown): number | null =>
  typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x)) ? Number(x) : null;
const str = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);

type DepEntry = { taskRef?: string; text?: string; draftRef?: string; title?: string };
const firstTaskRef = (deps: DepEntry[] | undefined): string | null =>
  deps?.find((x) => x.taskRef && !x.taskRef.startsWith("unknown:"))?.taskRef ?? null;

export function emptyPhase(golden: GoldenCase): PhaseActual {
  const tasks = golden.board?.tasks ?? [];
  return {
    proposals: [],
    rawCalls: [],
    boardRefs: tasks.map((t) => t.ref),
    openRefs: tasks.filter((t) => t.status !== "Done").map((t) => t.ref),
    boardTasks: tasks.map((t) => ({ ref: t.ref, title: t.title, status: t.status, ownerName: t.ownerName })),
  };
}

export function mapPhase(golden: GoldenCase, maps: RawMaps, raw: RawPhase): PhaseActual {
  const ref = (id: unknown) => {
    const n = num(id);
    return n == null ? null : maps.refByTaskId[String(n)] ?? null;
  };
  const vendor = (id: unknown) => {
    const n = num(id);
    return n == null ? null : maps.vendorNameById[String(n)] ?? null;
  };
  const contact = (id: unknown) => {
    const n = num(id);
    return n == null ? null : maps.contactNameById[String(n)] ?? null;
  };

  // dependsOn as stored ([{ taskId } | { text }], GAPS-PLAN feature 2) → the
  // scorer's entries ({ taskRef } | { text }). Other keys (feature 3's
  // draftRef / title) pass through. A legacy blockedByTaskId comes first.
  const mapDeps = (rawDeps: unknown, legacyBlockedBy: unknown): DepEntry[] | undefined => {
    const list = Array.isArray(rawDeps) ? rawDeps : rawDeps && typeof rawDeps === "object" ? [rawDeps] : [];
    const out: DepEntry[] = [];
    const legacy = ref(legacyBlockedBy);
    if (legacy) out.push({ taskRef: legacy });
    for (const e of list) {
      if (!e || typeof e !== "object") continue;
      const { taskId, ...rest } = e as Record<string, unknown>;
      if (taskId !== undefined) {
        const r = ref(taskId);
        if (r && !out.some((x) => x.taskRef === r)) out.push({ ...rest, taskRef: r });
        else if (!r) out.push({ ...rest, taskRef: `unknown:${String(taskId)}` });
      } else {
        out.push(rest as DepEntry);
      }
    }
    // Old runs had no structured dependencies: keep the field absent so their mapped view is unchanged.
    return out.length > 0 ? out : rawDeps === undefined ? undefined : out;
  };

  const proposals: Proposal[] = raw.drafts.map((d) => {
    const p = d.payload ?? {};
    const changes = (p.changes && typeof p.changes === "object" ? p.changes : {}) as Record<string, unknown>;
    const base: Proposal = {
      action: d.action as Proposal["action"],
      draftId: d.id,
      sourceQuote: d.sourceQuote ?? str(p.sourceQuote),
      confidence: d.confidence,
      dependsOn: mapDeps(p.dependsOn ?? changes.dependsOn, d.action === "create_task" ? undefined : changes.blockedByTaskId),
      draftRef: str(p.draftRef),
    };
    if (d.action === "create_task") {
      const ownerId = num(p.ownerId);
      const contactId = num(p.assigneeContactId);
      return {
        ...base,
        title: str(p.title),
        description: str(p.description),
        notes: str(p.notes),
        ownerName: vendor(ownerId),
        assigneeContactName: contact(contactId),
        ownerSide: contactId != null ? "customer" : ownerId != null ? "vendor" : null,
        dueDate: str(p.dueDate),
        priority: str(p.priority),
        // First task blocker: the legacy field on older drafts, else the first dependsOn task.
        blockedByRef: ref(p.blockedByTaskId) ?? firstTaskRef(mapDeps(p.dependsOn, undefined)),
      };
    }
    // match_existing: current drafts carry every change in `changes`
    // (lib/ai/task-update.ts); legacy rows carry one `action` with
    // newDueDate / newPriority. Read both, legacy first, so a stored legacy
    // run rescores identically.
    return {
      ...base,
      taskRef: ref(p.taskId),
      updateKind: str(p.action),
      newStatus: str(p.newStatus),
      newDueDate: str(p.newDueDate) ?? str(changes.dueDate),
      ...(changes.dueDate === null && { clearsDueDate: true }),
      newPriority: str(p.newPriority) ?? str(changes.priority),
      newOwnerName: vendor(changes.ownerId) ?? contact(changes.assigneeContactId),
      notes: str(p.notes),
      appendNotes: str(p.appendNotes) ?? str(changes.appendNotes),
    };
  });

  const output = Array.isArray(raw.orchestratorOutput) ? raw.orchestratorOutput : [];
  // flag_no_action_items is never persisted as a draft; read it from Pass 2's output.
  for (const f of output.filter((c) => c.tool === "flag_no_action_items")) {
    proposals.push({ action: "flag_no_action_items", draftId: null, sourceQuote: null, title: null, notes: str(f.input?.reason) });
  }

  const rawCalls: RawCall[] = output.map((c) => {
    const call: RawCall = {
      tool: c.tool,
      taskId: num(c.input?.taskId),
      taskRef: ref(c.input?.taskId),
      blockedByTaskId: num(c.input?.blockedByTaskId),
      blockedByRef: ref(c.input?.blockedByTaskId),
      sourceQuote: str(c.input?.sourceQuote),
    };
    // Task ids the AI cited in dependsOn (create, or an update's changes).
    const inputChanges = c.input?.changes && typeof c.input.changes === "object" ? (c.input.changes as Record<string, unknown>) : {};
    const rawDeps = c.input?.dependsOn ?? inputChanges.dependsOn;
    const depIds = (Array.isArray(rawDeps) ? rawDeps : rawDeps && typeof rawDeps === "object" ? [rawDeps] : [])
      .map((e) => num((e as Record<string, unknown> | null)?.taskId))
      .filter((n): n is number => n != null);
    if (depIds.length > 0) call.dependsOnTaskIds = depIds.map((id) => ({ id, ref: ref(id) }));
    return call;
  });

  return { ...emptyPhase(golden), proposals, rawCalls };
}

export function meetingSources(golden: GoldenCase) {
  const meeting = golden.payload.meeting;
  return {
    transcript: (meeting.transcript ?? []).map((t) => t?.text ?? "").filter(Boolean).join("\n"),
    actionItemsText: (meeting.action_items ?? []).map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n"),
  };
}

export function buildActual(golden: GoldenCase, raw: RawCase): CaseActual {
  const { transcript, actionItemsText } = meetingSources(golden);
  const prefix = raw.match.onboardingId != null ? raw.maps.companyPrefixByOnboardingId[String(raw.match.onboardingId)] ?? null : null;
  const actual: CaseActual = {
    match: { companyPrefix: prefix, ambiguous: raw.match.ambiguous, matchedBy: raw.match.matchedBy },
    transcript,
    actionItemsText,
    initial: mapPhase(golden, raw.maps, raw.initial),
    error: raw.error,
  };
  if (raw.afterAssign) {
    const phase = raw.afterAssign.assigned ? mapPhase(golden, raw.maps, raw.afterAssign) : emptyPhase(golden);
    actual.afterAssign = { ...phase, companyPrefix: raw.afterAssign.companyPrefix };
  }
  if (raw.redelivery) actual.redelivery = raw.redelivery;
  return actual;
}
