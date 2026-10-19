/**
 * Deterministic scoring for the golden-set eval (EVALS_PLAN Layer 1).
 *
 * PURE functions only: no DB, no AI, no imports from lib/. The runner
 * (evals/run-golden.ts) replays each meeting through the real pipeline, maps
 * database ids back to the answer key's vocabulary (board refs t1..., people's
 * names) and hands the result to `scoreCase` together with the case's
 * `expected` block. The answer-key format is evals/golden/README.md.
 *
 * Conventions
 * - Every metric is a Count { count, total }: never a bare percentage.
 * - Field accuracies (owner, assignee, due date, priority, status, notes,
 *   dependencies) are scored only on PAIRED calls: "when the AI found the task,
 *   did it get this field right?". Missing the task entirely is recall's job;
 *   counting it again in every field would double-penalise one miss.
 * - Anything tagged with a `gap` code is a capability the AI's tools do not
 *   have yet. Those sub-expectations are left out of the headline metrics and
 *   reported as "gap expectations met: N of M", broken down by code. The
 *   other fields on the same call are scored normally.
 *
 * Fuzzy matching (documented thresholds)
 * - Words: lowercased, punctuation and accents stripped, number words
 *   zero..twenty read as digits, and lightly stemmed (`stem`: plural -s/-es/
 *   -ies, -ed, -ing, a doubled final consonant, a final -e), so "dashboards" =
 *   "dashboard", "tagged" = "tag", "shared" = "share".
 * - Titles: word-set Dice coefficient on stemmed words after dropping
 *   stopwords (`contentSimilarity`), taking the best of `titleLike` and any
 *   `titleAlternatives`. A proposal can pair with an expected create_task when
 *   similarity >= PAIR_THRESHOLD (0.35), or >= QUOTE_ASSISTED_THRESHOLD (0.15)
 *   when the draft's sourceQuote also contains the expected
 *   `sourceQuoteContains` phrase. Edge score = similarity + 0.5 if the quote
 *   matches. Among those edges the scorer picks the OPTIMAL assignment: the
 *   most pairs, then the highest total score (exhaustive search, the sets are
 *   small), so close titles in one case cannot steal each other's drafts by
 *   order. Existing-task expectations pair by board ref first (the strongest
 *   signal), so a draft on the right task pairs even when its action type is
 *   wrong (action accuracy then catches it). A match_existing / update_status
 *   draft takes its target task's title for title pairing, so "updated the
 *   existing task when a new one was expected" also pairs and shows up as an
 *   action error.
 * - notesContains phrases, in the draft's description + notes: first as an
 *   exact contiguous phrase; failing that, the phrase's content words (not
 *   stopwords; "no"/"not" are content words) must appear IN ORDER with at most
 *   NOTES_WINDOW - 1 other tokens between consecutive ones. So "not the raw
 *   PHI" matches "not raw PHI data", but "no raw layer" does not match "the
 *   layer is raw, there is no time".
 */

import type {
  CaseActual,
  DependsOn,
  ExpectedToolCall,
  GapCode,
  Kind,
  PhaseActual,
  Proposal,
} from "./harness/types";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Lowercase, straighten quotes and dashes, keep only letters/digits/spaces. */
export function normalizeText(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};

/** normalizeText plus number words → digits ("four" = "4"). */
export function normalizeLoose(text: unknown): string {
  return normalizeText(text)
    .split(" ")
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(" ");
}

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "for", "and", "or", "in", "on", "at", "by", "with", "from", "into",
  "is", "are", "be", "it", "its", "this", "that", "our", "their", "your", "s", "as", "up", "out",
  "will", "would", "can",
]);

/**
 * Light stemmer: enough that plurals and simple tenses meet. Not Porter;
 * deliberately conservative so unrelated words do not collapse together.
 */
export function stem(word: string): string {
  if (word.length <= 3 || /^\d+$/.test(word)) return word;
  let s = word;
  let stripped = false;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (/(ss|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  else if (s.endsWith("ing") && s.length > 5) {
    s = s.slice(0, -3);
    stripped = true;
  } else if (s.endsWith("ed") && s.length > 4 && !s.endsWith("eed")) {
    s = s.slice(0, -2);
    stripped = true;
  }
  if (stripped && /([bgmnpt])\1$/.test(s)) s = s.slice(0, -1); // tagging → tag, planned → plan
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1); // share / shared / sharing → shar
  return s;
}

function words(text: unknown, { dropStopwords = false } = {}): string[] {
  const w = normalizeLoose(text).split(" ").filter(Boolean);
  return (dropStopwords ? w.filter((x) => !STOPWORDS.has(x)) : w).map(stem);
}

/** Does the (normalised) quote appear verbatim in the (normalised) text? Empty never appears. */
export function quoteAppearsIn(quote: unknown, text: unknown): boolean {
  const q = normalizeText(quote);
  if (!q) return false;
  return normalizeText(text).includes(q);
}

/** Plain word-set Dice coefficient (kept as-is: validate-golden.mjs uses it with a 0.6 threshold). */
export function titleSimilarity(a: unknown, b: unknown): number {
  const wordsA = new Set(normalizeText(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  return (2 * shared) / (wordsA.size + wordsB.size);
}

/** Word-set Dice coefficient after dropping stopwords; used for pairing. */
export function contentSimilarity(a: unknown, b: unknown): number {
  const wordsA = new Set(words(a, { dropStopwords: true }));
  const wordsB = new Set(words(b, { dropStopwords: true }));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  return (2 * shared) / (wordsA.size + wordsB.size);
}

/** Max distance between consecutive content words of a notes phrase (3 = at most 2 tokens between). */
export const NOTES_WINDOW = 3;

/** notesContains matching; see the header for the rule. */
export function phraseFound(phrase: string, text: unknown): boolean {
  const p = words(phrase);
  if (p.length === 0) return false;
  const t = words(text);
  // 1. Exact contiguous phrase (stemmed).
  for (let i = 0; i + p.length <= t.length; i++) {
    if (p.every((w, j) => t[i + j] === w)) return true;
  }
  // 2. Content words in order, each within NOTES_WINDOW of the previous one.
  const needed = words(phrase, { dropStopwords: true });
  if (needed.length === 0) return false;
  const from = (k: number, prev: number): boolean => {
    if (k === needed.length) return true;
    const hi = k === 0 ? t.length - 1 : Math.min(t.length - 1, prev + NOTES_WINDOW);
    for (let i = prev + 1; i <= hi; i++) if (t[i] === needed[k] && from(k + 1, i)) return true;
    return false;
  };
  return from(0, -1);
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export type Count = { count: number; total: number };
export const count = (c = 0, t = 0): Count => ({ count: c, total: t });
export const addCount = (a: Count, b: Count): Count => ({ count: a.count + b.count, total: a.total + b.total });
export function ratio(c: Count): number | null {
  return c.total === 0 ? null : c.count / c.total;
}
/** "12 of 30 (40%)"; "n/a (0 applicable)" when nothing applied. */
export function formatCount(c: Count): string {
  if (c.total === 0) return "n/a (0 applicable)";
  return `${c.count} of ${c.total} (${Math.round((c.count / c.total) * 100)}%)`;
}

const asList = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const emptyToNull = (x: unknown): string | null => (x == null || x === "" ? null : String(x));
const sameName = (a: unknown, b: unknown) => normalizeText(a) !== "" && normalizeText(a) === normalizeText(b);

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

export const PAIR_THRESHOLD = 0.35;
export const QUOTE_ASSISTED_THRESHOLD = 0.15;
const QUOTE_BONUS = 0.5;

export type Pair = { expectedIndex: number; proposalIndex: number; score: number; by: "ref" | "title" | "flag" };

function boardTitle(actual: PhaseActual, ref: string | null | undefined): string | null {
  if (!ref) return null;
  return actual.boardTasks.find((t) => t.ref === ref)?.title ?? null;
}

function proposalTitle(p: Proposal, actual: PhaseActual): string | null {
  return p.title ?? boardTitle(actual, p.taskRef);
}

function expectedTitle(e: ExpectedToolCall, actual: PhaseActual): string | null {
  return e.titleLike ?? boardTitle(actual, e.existingTaskRef);
}

/** All acceptable wordings of an expected call's title. */
function expectedTitles(e: ExpectedToolCall, actual: PhaseActual): string[] {
  const main = expectedTitle(e, actual);
  return [...(main ? [main] : []), ...(e.titleAlternatives ?? [])];
}

/** Best similarity between a draft title and any acceptable wording. */
export function bestTitleSimilarity(proposal: string | null, titles: string[]): number {
  return titles.reduce((best, t) => Math.max(best, contentSimilarity(proposal, t)), 0);
}

export type Edge = { ei: number; pi: number; score: number };

/**
 * Optimal assignment over candidate edges: most pairs first, then the highest
 * total score. Exhaustive over expected-subsets (bitmask DP); expected calls
 * per case are few (<= 6 today), so this is instant. Ties keep the first
 * solution found, which is deterministic.
 */
export function optimalAssignment(edges: Edge[], expectedIdx: number[], proposalIdx: number[]): Edge[] {
  if (expectedIdx.length > 16) throw new Error("optimalAssignment: too many expected calls for exhaustive search");
  const bit = new Map(expectedIdx.map((ei, i) => [ei, 1 << i]));
  type State = { pairs: number; total: number; chosen: Edge[] };
  let states = new Map<number, State>([[0, { pairs: 0, total: 0, chosen: [] }]]);
  const better = (a: State, b: State | undefined) =>
    !b || a.pairs > b.pairs || (a.pairs === b.pairs && a.total > b.total + 1e-9);
  for (const pi of proposalIdx) {
    const mine = edges.filter((e) => e.pi === pi);
    const next = new Map(states);
    for (const [mask, st] of states) {
      for (const e of mine) {
        const b = bit.get(e.ei);
        if (b === undefined || mask & b) continue;
        const cand: State = { pairs: st.pairs + 1, total: st.total + e.score, chosen: [...st.chosen, e] };
        if (better(cand, next.get(mask | b))) next.set(mask | b, cand);
      }
    }
    states = next;
  }
  let best: State = { pairs: 0, total: 0, chosen: [] };
  for (const st of states.values()) if (better(st, best)) best = st;
  return best.chosen;
}

/** Does the draft quote the passage the answer key points at? */
export function quoteMatches(proposalQuote: unknown, expectedQuote: unknown): boolean {
  const p = normalizeText(proposalQuote);
  const e = normalizeText(expectedQuote);
  if (!p || !e) return false;
  if (p.includes(e)) return true;
  // A draft may quote a shorter piece of the same sentence.
  return p.split(" ").length >= 6 && e.includes(p);
}

export function pairCalls(expected: ExpectedToolCall[], proposals: Proposal[], actual: PhaseActual) {
  const freeE = new Set(expected.map((_, i) => i));
  const freeP = new Set(proposals.map((_, i) => i));
  const pairs: Pair[] = [];
  const take = (ei: number, pi: number, score: number, by: Pair["by"]) => {
    pairs.push({ expectedIndex: ei, proposalIndex: pi, score, by });
    freeE.delete(ei);
    freeP.delete(pi);
  };

  // 1. Board ref identity, preferring a proposal with the same action.
  for (const ei of [...freeE]) {
    const e = expected[ei];
    if (!e.existingTaskRef) continue;
    const candidates = [...freeP].filter((pi) => proposals[pi].taskRef === e.existingTaskRef);
    const pi = candidates.find((i) => proposals[i].action === e.action) ?? candidates[0];
    if (pi !== undefined) take(ei, pi, 1, "ref");
  }

  // 2. Title (+ quote) pairing: optimal assignment over the candidate edges.
  const edges: Edge[] = [];
  const titleE = [...freeE].filter((ei) => expected[ei].action !== "flag_no_action_items");
  const titleP = [...freeP].filter((pi) => proposals[pi].action !== "flag_no_action_items");
  for (const ei of titleE) {
    const e = expected[ei];
    const titles = expectedTitles(e, actual);
    for (const pi of titleP) {
      const p = proposals[pi];
      const sim = bestTitleSimilarity(proposalTitle(p, actual), titles);
      const quote = quoteMatches(p.sourceQuote, e.sourceQuoteContains);
      if (sim >= PAIR_THRESHOLD || (quote && sim >= QUOTE_ASSISTED_THRESHOLD)) {
        edges.push({ ei, pi, score: sim + (quote ? QUOTE_BONUS : 0) });
      }
    }
  }
  for (const e of optimalAssignment(edges, titleE, titleP)) take(e.ei, e.pi, e.score, "title");

  // 3. flag_no_action_items pairs with a flag.
  for (const ei of [...freeE]) {
    if (expected[ei].action !== "flag_no_action_items") continue;
    const pi = [...freeP].find((i) => proposals[i].action === "flag_no_action_items");
    if (pi !== undefined) take(ei, pi, 1, "flag");
  }

  return { pairs, unmatchedExpected: [...freeE], unmatchedProposed: [...freeP] };
}

// ---------------------------------------------------------------------------
// Per-call checks
// ---------------------------------------------------------------------------

/** `scored: false` = shown for reading but left out of the metric (see the assignee rule). */
export type FieldCheck = { expected: unknown; actual: unknown; pass: boolean; scored?: false };

export type CallResult = {
  index: number;
  action: ExpectedToolCall["action"];
  title: string | null;
  kind: Kind | null;
  paired: boolean;
  pairedWith: { draftId: number | null; action: string; title: string | null; score: number; by: Pair["by"] } | null;
  checks: Partial<Record<"action" | "owner" | "assignee" | "dueDate" | "priority" | "newStatus", FieldCheck>>;
  notes: { found: string[]; missing: string[] } | null;
  dependencies: FieldCheck[];
  gaps: GapResult[];
};

export type GapResult = { codes: GapCode[]; what: string; met: boolean };

/** Where a new task's specifics live: description + notes. */
function proposalText(p: Proposal): string {
  return [p.description, p.notes].filter(Boolean).join(" \n ");
}

/** Who owns the task once the draft is applied, by name. */
function proposalAssignee(p: Proposal, actual: PhaseActual): string | null {
  if (p.action === "create_task") {
    return p.ownerSide === "customer" ? p.assigneeContactName ?? null : p.ownerName ?? null;
  }
  if (p.newOwnerName) return p.newOwnerName; // future multi-field update
  if (p.updateKind === "reassign") return null; // today's tool cannot name the new owner
  return actual.boardTasks.find((t) => t.ref === p.taskRef)?.ownerName ?? null;
}

/** Does an existing-task draft touch ownership at all? */
function addressesOwnership(p: Proposal): boolean {
  return p.updateKind === "reassign" || !!p.newOwnerName;
}

/** A structured dependency on the draft (future GAPS-PLAN shape), as plain entries. */
type DepEntry = { taskRef?: string; text?: string; draftRef?: string; title?: string };
function structuredDeps(p: Proposal): DepEntry[] {
  return asList(p.dependsOn as DepEntry | DepEntry[] | null | undefined).filter((d) => d && typeof d === "object");
}

function dependencyMet(
  d: DependsOn,
  p: Proposal,
  ctx: { proposals: Proposal[]; expected: ExpectedToolCall[]; pairByExpected: Map<number, number> }
): boolean {
  const deps = structuredDeps(p);
  if (d.existingTaskRef) {
    if (p.blockedByRef === d.existingTaskRef) return true;
    return deps.some((x) => x.taskRef === d.existingTaskRef);
  }
  if (d.freeText) {
    if (deps.some((x) => x.text && phraseFound(d.freeText!, x.text))) return true;
    // Today's prompt says to put external blockers in the notes.
    return phraseFound(d.freeText, proposalText(p));
  }
  if (d.newTaskTitleLike) {
    // Which draft did the answer key mean? The proposal paired with the expected create of that title.
    const ei = ctx.expected.findIndex(
      (e) => e.action === "create_task" && e.titleLike && contentSimilarity(e.titleLike, d.newTaskTitleLike) >= 0.6
    );
    const target = ei >= 0 ? ctx.pairByExpected.get(ei) : undefined;
    const targetProposal = target !== undefined ? ctx.proposals[target] : undefined;
    return deps.some((x) => {
      if (x.draftRef && targetProposal && targetProposal.draftRef === x.draftRef) return true;
      return !!x.title && contentSimilarity(x.title, d.newTaskTitleLike) >= PAIR_THRESHOLD;
    });
  }
  return false;
}

function check(expected: unknown, actual: unknown, pass: boolean): FieldCheck {
  return { expected, actual, pass };
}

export type PhaseScore = {
  calls: CallResult[];
  unmatchedProposals: { draftId: number | null; action: string; title: string | null; sourceQuote: string | null }[];
  proposalsCount: number;
  duplicates: { draftId: number | null; title: string | null; looksLike: string }[];
  groundedness: {
    quotes: Count;
    quoteViolations: string[];
    quotesFromActionItemsOnly: number;
    citedIds: Count;
    citedIdViolations: string[];
  };
  totals: Totals;
};

export type Totals = {
  recall: Count;
  precision: Count;
  action: Count;
  ownerSide: Count;
  assignee: Count;
  dueDate: Count;
  priority: Count;
  status: Count;
  notesPhrases: Count;
  dependencies: Count;
  kindRecall: Record<Kind, Count>;
  groundedQuotes: Count;
  citedIdsValid: Count;
  duplicates: Count;
  gaps: Count;
  gapsByCode: Record<string, Count>;
};

export function emptyTotals(): Totals {
  return {
    recall: count(), precision: count(), action: count(), ownerSide: count(), assignee: count(),
    dueDate: count(), priority: count(), status: count(), notesPhrases: count(), dependencies: count(),
    kindRecall: { commitment: count(), parked_for_later: count(), vendor_reminder: count() },
    groundedQuotes: count(), citedIdsValid: count(), duplicates: count(),
    gaps: count(), gapsByCode: {},
  };
}

export function addTotals(a: Totals, b: Totals): Totals {
  const gapsByCode: Record<string, Count> = { ...a.gapsByCode };
  for (const [k, v] of Object.entries(b.gapsByCode)) gapsByCode[k] = addCount(gapsByCode[k] ?? count(), v);
  return {
    recall: addCount(a.recall, b.recall),
    precision: addCount(a.precision, b.precision),
    action: addCount(a.action, b.action),
    ownerSide: addCount(a.ownerSide, b.ownerSide),
    assignee: addCount(a.assignee, b.assignee),
    dueDate: addCount(a.dueDate, b.dueDate),
    priority: addCount(a.priority, b.priority),
    status: addCount(a.status, b.status),
    notesPhrases: addCount(a.notesPhrases, b.notesPhrases),
    dependencies: addCount(a.dependencies, b.dependencies),
    kindRecall: {
      commitment: addCount(a.kindRecall.commitment, b.kindRecall.commitment),
      parked_for_later: addCount(a.kindRecall.parked_for_later, b.kindRecall.parked_for_later),
      vendor_reminder: addCount(a.kindRecall.vendor_reminder, b.kindRecall.vendor_reminder),
    },
    groundedQuotes: addCount(a.groundedQuotes, b.groundedQuotes),
    citedIdsValid: addCount(a.citedIdsValid, b.citedIdsValid),
    duplicates: addCount(a.duplicates, b.duplicates),
    gaps: addCount(a.gaps, b.gaps),
    gapsByCode,
  };
}

const tally = (c: Count, pass: boolean) => {
  c.total += 1;
  if (pass) c.count += 1;
};

/** Duplicate threshold: a new task this close to an open board task is treated as a duplicate. */
export const DUPLICATE_THRESHOLD = 0.6;

/**
 * Score one phase (the initial delivery, or the run after a human assigns an
 * ambiguous meeting) of one case.
 */
export function scorePhase(
  expected: ExpectedToolCall[],
  actual: PhaseActual,
  sources: { transcript: string; actionItemsText: string }
): PhaseScore {
  const proposals = actual.proposals;
  const { pairs, unmatchedExpected, unmatchedProposed } = pairCalls(expected, proposals, actual);
  const pairByExpected = new Map(pairs.map((p) => [p.expectedIndex, p.proposalIndex]));
  const totals = emptyTotals();

  totals.recall = count(pairs.length, expected.length);
  totals.precision = count(pairs.length, proposals.length);

  const gapTally = (codes: GapCode[], met: boolean) => {
    tally(totals.gaps, met);
    for (const c of codes) {
      totals.gapsByCode[c] = totals.gapsByCode[c] ?? count();
      tally(totals.gapsByCode[c], met);
    }
  };

  const calls: CallResult[] = expected.map((e, ei) => {
    const pi = pairByExpected.get(ei);
    const p = pi !== undefined ? proposals[pi] : undefined;
    const pair = pairs.find((x) => x.expectedIndex === ei);
    const callGaps = asList(e.gap);
    const result: CallResult = {
      index: ei,
      action: e.action,
      title: expectedTitle(e, actual),
      kind: e.kind ?? null,
      paired: !!p,
      pairedWith: p && pair ? { draftId: p.draftId ?? null, action: p.action, title: proposalTitle(p, actual), score: Number(pair.score.toFixed(3)), by: pair.by } : null,
      checks: {},
      notes: null,
      dependencies: [],
      gaps: [],
    };
    if (e.kind) tally(totals.kindRecall[e.kind], !!p);

    // Gap expectations: one per gap-tagged object. Unpaired → not met.
    const notesAreGap = callGaps.includes("existing_task_notes");
    // A gap is only met by a draft of the expected action: a duplicate
    // create_task paired with an existing-task expectation earns nothing.
    const sameAction = !!p && p.action === e.action;
    if (callGaps.length) {
      let met = sameAction;
      const what: string[] = [];
      if (callGaps.includes("existing_task_notes") && e.notesContains) {
        what.push(`notes on existing task: ${e.notesContains.join(", ")}`);
        // Only real appended notes count (GAPS-PLAN feature 1), never a draft's own notes field.
        met = met && e.notesContains.every((ph) => phraseFound(ph, p!.appendNotes ?? ""));
      }
      if (callGaps.includes("multi_field_existing_update")) {
        what.push("several changes in one existing-task update");
        met = met && (e.newDueDate === undefined || p!.newDueDate === e.newDueDate)
          && (e.newPriority === undefined || p!.newPriority === e.newPriority);
      }
      if (what.length === 0) what.push(`call-level gap ${callGaps.join("+")}`);
      result.gaps.push({ codes: callGaps, what: what.join("; "), met });
      gapTally(callGaps, met);
    }
    const depCtx = { proposals, expected, pairByExpected };
    for (const d of asList(e.dependsOn)) {
      const depGaps = asList(d.gap);
      const label = d.existingTaskRef ? `task ${d.existingTaskRef}` : d.freeText ? `"${d.freeText}"` : `new draft "${d.newTaskTitleLike}"`;
      const met = sameAction && dependencyMet(d, p!, depCtx);
      if (depGaps.length) {
        result.gaps.push({ codes: depGaps, what: `depends on ${label}`, met });
        gapTally(depGaps, met);
      } else if (p) {
        const fc = check(label, p.blockedByRef ?? null, met);
        result.dependencies.push(fc);
        tally(totals.dependencies, met);
      }
    }

    if (!p) return result;

    // ---- Field checks on paired calls.
    const actionPass = p.action === e.action;
    result.checks.action = check(e.action, p.action, actionPass);
    tally(totals.action, actionPass);

    if (e.owner !== undefined) {
      const side = p.action === "create_task" ? p.ownerSide ?? null : null;
      const pass = side === e.owner;
      result.checks.owner = check(e.owner, side, pass);
      tally(totals.ownerSide, pass);
    }
    if (e.assignee !== undefined) {
      const who = proposalAssignee(p, actual);
      const pass = sameName(who, e.assignee);
      // On an existing task whose board owner already IS the expected person,
      // a draft that leaves ownership alone is right for free. Count it only
      // when the draft touches ownership (or the answer key expects a change).
      const boardOwner = actual.boardTasks.find((t) => t.ref === e.existingTaskRef)?.ownerName ?? null;
      const freePass = e.action !== "create_task" && p.action !== "create_task"
        && sameName(boardOwner, e.assignee) && !addressesOwnership(p);
      if (freePass) {
        result.checks.assignee = { expected: e.assignee, actual: who, pass, scored: false };
      } else {
        result.checks.assignee = check(e.assignee, who, pass);
        tally(totals.assignee, pass);
      }
    }
    if (e.action === "create_task" && e.dueDate !== undefined) {
      const got = emptyToNull(p.action === "create_task" ? p.dueDate : p.newDueDate);
      const pass = got === (e.dueDate ?? null);
      result.checks.dueDate = check(e.dueDate, got, pass);
      tally(totals.dueDate, pass);
    } else if (e.newDueDate !== undefined && !callGaps.includes("multi_field_existing_update")) {
      const got = emptyToNull(p.newDueDate);
      const pass = got === e.newDueDate;
      result.checks.dueDate = check(e.newDueDate, got, pass);
      tally(totals.dueDate, pass);
    }
    if (e.priority !== undefined || (e.newPriority !== undefined && !callGaps.includes("multi_field_existing_update"))) {
      const want = e.priority ?? e.newPriority;
      const got = emptyToNull(p.action === "create_task" ? p.priority : p.newPriority);
      const pass = got === want;
      result.checks.priority = check(want, got, pass);
      tally(totals.priority, pass);
    }
    if (e.newStatus !== undefined) {
      const got = emptyToNull(p.newStatus);
      const pass = got === e.newStatus;
      result.checks.newStatus = check(e.newStatus, got, pass);
      tally(totals.status, pass);
    }
    if (e.notesContains && !notesAreGap) {
      const text = proposalText(p);
      const found = e.notesContains.filter((ph) => phraseFound(ph, text));
      result.notes = { found, missing: e.notesContains.filter((ph) => !found.includes(ph)) };
      totals.notesPhrases = addCount(totals.notesPhrases, count(found.length, e.notesContains.length));
    }
    return result;
  });

  // ---- Groundedness.
  const quoteViolations: string[] = [];
  let fromActionItems = 0;
  for (const p of proposals) {
    if (p.action === "flag_no_action_items" || !p.sourceQuote) continue;
    const inTranscript = quoteAppearsIn(p.sourceQuote, sources.transcript);
    if (!inTranscript && quoteAppearsIn(p.sourceQuote, sources.actionItemsText)) fromActionItems += 1;
    tally(totals.groundedQuotes, inTranscript);
    if (!inTranscript) quoteViolations.push(p.sourceQuote);
  }
  // The AI is only shown OPEN tasks, so a cited id is valid only if it is an open board task.
  const citedIdViolations: string[] = [];
  const openRefs = new Set(actual.openRefs);
  for (const c of actual.rawCalls) {
    for (const [field, id, ref] of [
      ["taskId", c.taskId, c.taskRef],
      ["blockedByTaskId", c.blockedByTaskId, c.blockedByRef],
    ] as const) {
      if (id == null) continue;
      const ok = !!ref && openRefs.has(ref);
      tally(totals.citedIdsValid, ok);
      if (!ok) citedIdViolations.push(`${c.tool}.${field}=${id}`);
    }
  }

  // ---- Duplicates: new-task drafts that restate an open board task.
  const openTitles = actual.boardTasks.filter((t) => actual.openRefs.includes(t.ref));
  const duplicates: PhaseScore["duplicates"] = [];
  for (const p of proposals) {
    if (p.action !== "create_task") continue;
    const hit = openTitles.find((t) => contentSimilarity(t.title, p.title) >= DUPLICATE_THRESHOLD);
    tally(totals.duplicates, !!hit);
    if (hit) duplicates.push({ draftId: p.draftId ?? null, title: p.title ?? null, looksLike: `${hit.ref} "${hit.title}"` });
  }

  return {
    calls,
    unmatchedProposals: unmatchedProposed.map((pi) => {
      const p = proposals[pi];
      return { draftId: p.draftId ?? null, action: p.action, title: proposalTitle(p, actual), sourceQuote: p.sourceQuote ?? null };
    }),
    proposalsCount: proposals.length,
    duplicates,
    groundedness: {
      quotes: totals.groundedQuotes,
      quoteViolations,
      quotesFromActionItemsOnly: fromActionItems,
      citedIds: totals.citedIdsValid,
      citedIdViolations,
    },
    totals,
  };
}

// ---------------------------------------------------------------------------
// Whole case
// ---------------------------------------------------------------------------

export type CaseScore = {
  match: { pass: boolean; expected: string; actual: string; matchedBy: string | null };
  initial: PhaseScore;
  /** Ambiguous cases: no drafts may exist before a human assigns the meeting. */
  heldBeforeAssign: { pass: boolean; drafts: number } | null;
  afterAssign: (PhaseScore & { companyPrefix: string }) | null;
  dedup: { pass: boolean; deduped: boolean; newDrafts: number } | null;
  totals: Totals;
};

export type ExpectedBlock = {
  match: { companyPrefix?: string; ambiguous?: boolean };
  toolCalls: ExpectedToolCall[];
  afterAssign?: { companyPrefix: string; toolCalls: ExpectedToolCall[] };
};

export function scoreCase(expected: ExpectedBlock, actual: CaseActual): CaseScore {
  const wantAmbiguous = expected.match.ambiguous === true;
  const matchPass = wantAmbiguous
    ? actual.match.ambiguous
    : !actual.match.ambiguous && actual.match.companyPrefix === expected.match.companyPrefix;
  const match = {
    pass: matchPass,
    expected: wantAmbiguous ? "ambiguous" : expected.match.companyPrefix ?? "?",
    actual: actual.match.ambiguous ? "ambiguous" : actual.match.companyPrefix ?? "no match",
    matchedBy: actual.match.matchedBy,
  };
  const sources = { transcript: actual.transcript, actionItemsText: actual.actionItemsText };

  // A wrongly matched case still has its drafts scored against the expected
  // calls (they will mostly miss), so recall reflects the match failure.
  const initial = scorePhase(expected.toolCalls, actual.initial, sources);
  let totals = initial.totals;

  let heldBeforeAssign: CaseScore["heldBeforeAssign"] = null;
  if (wantAmbiguous) {
    const drafts = actual.initial.proposals.filter((p) => p.action !== "flag_no_action_items").length;
    heldBeforeAssign = { pass: drafts === 0, drafts };
  }

  let afterAssign: CaseScore["afterAssign"] = null;
  if (expected.afterAssign) {
    const phase: PhaseActual = actual.afterAssign ?? { proposals: [], rawCalls: [], boardRefs: [], openRefs: [], boardTasks: [] };
    const s = scorePhase(expected.afterAssign.toolCalls, phase, sources);
    afterAssign = { ...s, companyPrefix: expected.afterAssign.companyPrefix };
    totals = addTotals(totals, s.totals);
  }

  let dedup: CaseScore["dedup"] = null;
  if (actual.redelivery) {
    dedup = {
      pass: actual.redelivery.deduped && actual.redelivery.newDrafts === 0,
      deduped: actual.redelivery.deduped,
      newDrafts: actual.redelivery.newDrafts,
    };
  }

  return { match, initial, heldBeforeAssign, afterAssign, dedup, totals };
}

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------

export type RunSummary = {
  cases: number;
  errors: number;
  match: Count;
  heldBeforeAssign: Count;
  dedup: Count;
  totals: Totals;
};

export function summarise(scores: (CaseScore | null)[]): RunSummary {
  let totals = emptyTotals();
  const match = count();
  const held = count();
  const dedup = count();
  let errors = 0;
  for (const s of scores) {
    if (!s) {
      errors += 1;
      continue;
    }
    tally(match, s.match.pass);
    if (s.heldBeforeAssign) tally(held, s.heldBeforeAssign.pass);
    if (s.dedup) tally(dedup, s.dedup.pass);
    totals = addTotals(totals, s.totals);
  }
  return { cases: scores.length, errors, match, heldBeforeAssign: held, dedup, totals };
}

/** Plain-English console lines for a run summary. */
export function summaryLines(s: RunSummary): string[] {
  const t = s.totals;
  const lines = [
    `Cases scored:              ${s.cases - s.errors} of ${s.cases}${s.errors ? `  (${s.errors} errored, not scored)` : ""}`,
    `Match accuracy:            ${formatCount(s.match)}`,
    `Ambiguous held for a human:${" "}${formatCount(s.heldBeforeAssign)}`,
    `Re-delivery deduped:       ${formatCount(s.dedup)}`,
    `Task recall:               ${formatCount(t.recall)}`,
    `  commitments:             ${formatCount(t.kindRecall.commitment)}`,
    `  parked for later:        ${formatCount(t.kindRecall.parked_for_later)}`,
    `  vendor reminders:        ${formatCount(t.kindRecall.vendor_reminder)}`,
    `Task precision:            ${formatCount(t.precision)}`,
    `Action type right:         ${formatCount(t.action)}`,
    `Owner side right:          ${formatCount(t.ownerSide)}`,
    `Assignee right:            ${formatCount(t.assignee)}`,
    `Due date right:            ${formatCount(t.dueDate)}`,
    `Priority right:            ${formatCount(t.priority)}`,
    `Status change right:       ${formatCount(t.status)}`,
    `Notes captured (phrases):  ${formatCount(t.notesPhrases)}`,
    `Dependencies right:        ${formatCount(t.dependencies)}`,
    `Quotes found in transcript:${" "}${formatCount(t.groundedQuotes)}`,
    `Cited ids = open tasks:    ${formatCount(t.citedIdsValid)}`,
    `New tasks duplicating board:${" "}${formatCount(t.duplicates)}  (lower is better)`,
    `Gap expectations met:      ${formatCount(t.gaps)}`,
  ];
  for (const [code, c] of Object.entries(t.gapsByCode).sort()) lines.push(`  ${code.padEnd(24)} ${formatCount(c)}`);
  return lines;
}
