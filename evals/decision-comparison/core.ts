/** Offline experiment only. No app, database, webhook, or email imports. */
import { createHash } from "node:crypto";
import { emptyPhase } from "../harness/map-actual";
import type { BoardTask, DependsOn, ExpectedToolCall, GoldenCase, Proposal } from "../harness/types";
import { blockerLabelMatches, contentSimilarity, pairCalls, scorePhase, type Count } from "../scoring";

export const EXPERIMENT_VERSION = "decision-comparison-v3";
export const QUESTION_BATCH_SIZE = 24;
export const DEFAULT_CASES = ["01", "02", "03", "13", "15", "17", "20", "26"];
export type Candidate = {
  id: string;
  type: "action" | "completion";
  claim: string;
  sourceQuote: string;
  speaker?: string;
  mentionedOwner?: string;
  mentionedDueDate?: string;
  mentionedDependency?: string;
  firmness?: string;
  notesSnippet?: string;
};
type Extraction = {
  actionItems?: Omit<Candidate, "id" | "type">[];
  reportedCompletions?: Omit<Candidate, "id" | "type">[];
  externalBlockers?: string[];
};
export type Question = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type Answer = { choice: string; confidence?: number; probabilities?: Record<string, number> };
export type Answers = Record<string, Answer>;
export type State = {
  policy: string;
  meeting: GoldenCase["payload"]["meeting"];
  recorder: { name: string } | null;
  candidates: Candidate[];
  people: Record<string, { name: string; side: "vendor" | "customer" }>;
  openTasks: BoardTask[];
  externalBlockers: string[];
};
export type Request = { state: State; questions: Record<string, Question> };

// Shared by both providers. No golden-case names, expected answers, or prior model outputs.
const POLICY = `Vector helps a vendor manage customer onboarding. Decide what an onboarding manager should track, using the transcript as evidence; extraction is fallible. Match existing open work before creating new work. Track concrete commitments, including promises to act immediately after the call. Track a specific deliverable parked for later when someone takes responsibility for remembering it; ignore general wishes. When an overwhelmed customer needs breathing room, keep a reminder for the vendor to circle back instead of assigning more work to the customer. The transcript speaker You is the vendor-side recorder; use recorder.name when known, otherwise leave ownership unknown. Identify genuine prerequisites, not merely things discussed together. A prerequisite can be another candidate, an existing open task, or an external blocker. Unclear choices should go to review. Every resulting draft still requires human approval. Dates and prose writing are outside this decision experiment.`;

export function makeRequest(golden: GoldenCase, extraction: Extraction, recorderName: string | null, vendorNames = golden.board?.vendorUsers.map(p => p.name) ?? []): Request {
  if (!golden.board) throw new Error("Case has no board; matching customers is outside this experiment");
  const candidates: Candidate[] = [
    ...(extraction.actionItems ?? []).map((c, i) => ({ ...c, id: `a${i + 1}`, type: "action" as const })),
    ...(extraction.reportedCompletions ?? []).map((c, i) => ({ ...c, id: `c${i + 1}`, type: "completion" as const })),
  ];
  const people: State["people"] = {};
  vendorNames.forEach((name, i) => { people[`vendor${i + 1}`] = { name, side: "vendor" }; });
  golden.board.contacts.forEach((p, i) => { people[`customer${i + 1}`] = { name: p.name, side: "customer" }; });
  const state: State = {
    policy: POLICY, meeting: golden.payload.meeting,
    recorder: recorderName ? { name: recorderName } : null,
    candidates, people, openTasks: golden.board.tasks.filter(t => t.status !== "Done"),
    externalBlockers: [...new Set(extraction.externalBlockers ?? [])],
  };
  const questions: Request["questions"] = {};
  const ask = (key: string, instructions: string, criteria: Record<string, string>) => {
    // Jev does not see the question-map key. Every instruction names its candidate explicitly.
    questions[key] = { type: "choice", instructions: `${POLICY}\n${instructions}`, criteria };
  };
  for (const c of candidates) {
    const subject = `candidates entry with id ${c.id}`;
    ask(`${c.id}_action`, `What should happen for ${subject}?`, {
      create_task: "A new concrete commitment, parked deliverable, or vendor reminder should become a task.",
      match_existing: "This adds or changes information about work already on the open board; update that task.",
      update_status: "This reports an existing open task completed; propose marking it Done.",
      ignore: "No trackable commitment, owned parked deliverable, relevant update, or reminder.",
      review: "The action cannot be determined from the supplied evidence.",
    });
    ask(`${c.id}_task`, `Which existing open task is the SAME work as ${subject}? A prerequisite is not the same work. Choose none for genuinely new work.`, {
      none: "No existing open task is the same work.",
      ...Object.fromEntries(state.openTasks.map(t => [t.ref, `${t.title}. Notes: ${t.notes}`])),
      unclear: "Several tasks plausibly match and the evidence cannot distinguish them.",
    });
    ask(`${c.id}_owner`, `Who should own the work in ${subject}? For an update, identify the intended owner after the update. Follow the recorder rule and distinguish the person requesting work from the person promising to do it.`, {
      unknown: "No supplied person can be assigned confidently.",
      ...Object.fromEntries(Object.entries(people).map(([id, p]) => [id, `${p.name}, ${p.side} side`])),
    });
    for (const target of candidates.filter(t => t.id !== c.id)) {
      ask(`${c.id}_needs_${target.id}`, `Must the work in ${subject} wait for the work in candidate ${target.id}? Judge this prerequisite direction only.`, {
        yes: "The source evidence establishes that the first work requires the second work to happen first.",
        no: "No prerequisite in this direction is established, or both entries refer to the same work.",
        unclear: "A prerequisite is plausible but cannot be determined.",
      });
    }
    for (const target of state.openTasks) {
      ask(`${c.id}_needs_task_${target.ref}`, `Must the work in ${subject} wait for existing open task ${target.ref} (${target.title})? Do not mark a task as its own prerequisite.`, {
        yes: "The source evidence establishes this prerequisite.", no: "This prerequisite is not established, or it is the same work.", unclear: "Cannot determine.",
      });
    }
    state.externalBlockers.forEach((text, i) => {
      ask(`${c.id}_needs_external_${i}`, `Must the work in ${subject} wait for external blocker ${JSON.stringify(text)}?`, {
        yes: "The source establishes this external prerequisite for this work.", no: "No such prerequisite is established for this work.", unclear: "Cannot determine.",
      });
    });
  }
  return { state, questions };
}

export const requestHash = (request: Request) => createHash("sha256").update(JSON.stringify({ version: EXPERIMENT_VERSION, request })).digest("hex");

export function validateAnswers(request: Request, answers: Answers) {
  const wanted = Object.keys(request.questions);
  if (Object.keys(answers).length !== wanted.length) throw new Error("Provider returned missing or extra answers");
  for (const key of wanted) {
    const answer = answers[key];
    if (!answer || !Object.hasOwn(request.questions[key].criteria, answer.choice)) throw new Error(`Invalid answer to ${key}`);
    if (answer.confidence !== undefined && (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1)) throw new Error(`Invalid confidence for ${key}`);
  }
}

export function project(request: Request, answers: Answers) {
  validateAnswers(request, answers);
  const { state } = request;
  const proposals: Proposal[] = [];
  const unresolved: string[] = [];
  const choice = (key: string) => answers[key].choice;
  const candidateTarget = (id: string): Record<string, string> | null => {
    const action = choice(`${id}_action`);
    if (action === "create_task") return { draftRef: id };
    if (action === "match_existing" || action === "update_status") {
      const ref = choice(`${id}_task`);
      if (state.openTasks.some(t => t.ref === ref)) return { taskRef: ref };
    }
    return null;
  };
  for (const c of state.candidates) {
    const action = choice(`${c.id}_action`);
    if (action === "ignore") continue;
    if (action === "review") { unresolved.push(`${c.id}: action needs review`); continue; }
    const taskRef = choice(`${c.id}_task`);
    if (action !== "create_task" && !state.openTasks.some(t => t.ref === taskRef)) {
      unresolved.push(`${c.id}: ${action} has no unambiguous existing task`); continue;
    }
    const owner = state.people[choice(`${c.id}_owner`)];
    if (!owner) unresolved.push(`${c.id}: owner unknown`);
    const dependsOn: Record<string, string>[] = [];
    for (const target of state.candidates.filter(t => t.id !== c.id)) {
      const answer = choice(`${c.id}_needs_${target.id}`);
      if (answer === "unclear") unresolved.push(`${c.id}: dependency on ${target.id} unclear`);
      if (answer !== "yes") continue;
      const dep = candidateTarget(target.id);
      if (dep) dependsOn.push(dep);
      else unresolved.push(`${c.id}: needs ${target.id}, whose action is ignored or unresolved`);
    }
    for (const t of state.openTasks) {
      const answer = choice(`${c.id}_needs_task_${t.ref}`);
      if (answer === "unclear") unresolved.push(`${c.id}: dependency on ${t.ref} unclear`);
      if (answer === "yes") dependsOn.push({ taskRef: t.ref });
    }
    state.externalBlockers.forEach((text, i) => {
      const answer = choice(`${c.id}_needs_external_${i}`);
      if (answer === "unclear") unresolved.push(`${c.id}: external blocker ${i} unclear`);
      if (answer === "yes") dependsOn.push({ text });
    });
    const self = action === "create_task" ? { draftRef: c.id } : { taskRef };
    const deps = [...new Map(dependsOn.filter(d => JSON.stringify(d) !== JSON.stringify(self)).map(d => [JSON.stringify(d), d])).values()];
    const p: Proposal = {
      action: action as Proposal["action"], title: c.claim, sourceQuote: c.sourceQuote,
      draftId: proposals.length + 1, draftRef: action === "create_task" ? c.id : null,
      ...(action !== "create_task" && { taskRef }),
      ownerSide: owner?.side ?? null,
      ownerName: owner?.side === "vendor" ? owner.name : null,
      assigneeContactName: owner?.side === "customer" ? owner.name : null,
      // Preserve an existing owner unless the model proposes a genuinely different one.
      ...(action !== "create_task" && owner && state.openTasks.find(t => t.ref === taskRef)?.ownerName !== owner.name && { newOwnerName: owner.name }),
      ...(action === "update_status" && { newStatus: "Done" }), dependsOn: deps,
    };
    const previous = proposals.find(x => x.action === p.action && x.taskRef && x.taskRef === p.taskRef);
    if (previous) {
      previous.dependsOn = [...new Map([...(previous.dependsOn as Record<string, string>[]), ...deps].map(d => [JSON.stringify(d), d])).values()];
      if (p.newOwnerName && previous.newOwnerName && p.newOwnerName !== previous.newOwnerName) unresolved.push(`${taskRef}: conflicting owner decisions`);
      if (p.newOwnerName) previous.newOwnerName = p.newOwnerName;
    } else proposals.push(p);
  }
  // A cycle is exposed for review, never treated as a valid executable plan.
  const edges = new Map(proposals.map(p => [p.draftRef ?? p.taskRef!, (p.dependsOn as Record<string, string>[]).map(d => d.draftRef ?? d.taskRef).filter(Boolean)]));
  const cycle = (id: string, path: string[]): boolean => path.includes(id) || (edges.get(id) ?? []).some(next => cycle(next, [...path, id]));
  for (const id of edges.keys()) if (cycle(id, [])) unresolved.push(`${id}: dependency cycle requires review`);
  return { proposals, unresolved };
}

export function decisionExpectations(golden: GoldenCase): ExpectedToolCall[] {
  const expected = golden.expected.afterAssign?.toolCalls ?? golden.expected.toolCalls;
  return expected.map(e => ({
    action: e.action, titleLike: e.titleLike, titleAlternatives: e.titleAlternatives,
    existingTaskRef: e.existingTaskRef, existingTaskTitleContains: e.existingTaskTitleContains,
    owner: e.owner, assignee: e.assignee, sourceQuoteContains: e.sourceQuoteContains,
    newStatus: e.newStatus, dependsOn: e.dependsOn,
    // Notes, dates, priorities and free-form draft wording are deliberately not scored.
  }));
}

export function evaluate(golden: GoldenCase, request: Request, answers: Answers) {
  const result = project(request, answers);
  const actual = { ...emptyPhase(golden), proposals: result.proposals };
  const expected = decisionExpectations(golden);
  const score = scorePhase(expected, actual, {
    transcript: golden.payload.meeting.transcript?.map(t => t.text).join("\n") ?? "",
    actionItemsText: (golden.payload.meeting.action_items ?? []).join("\n"),
  });
  const correctAction: Count = { count: 0, total: expected.length };
  const correctOwner: Count = { count: 0, total: expected.filter(e => e.assignee).length };
  for (const call of score.calls) {
    if (call.checks.action?.pass) correctAction.count++;
    if (call.checks.assignee?.pass) correctOwner.count++;
  }
  const supported = pairCalls(expected, result.proposals, actual);
  const list = (d: ExpectedToolCall["dependsOn"]): DependsOn[] => d ? Array.isArray(d) ? d : [d] : [];
  const matches = (d: DependsOn, link: Record<string, string>) => {
    if (d.existingTaskRef) return link.taskRef === d.existingTaskRef;
    if (d.freeText) return !!link.text && blockerLabelMatches(d.freeText, link.text);
    const ei = expected.findIndex(e => e.action === "create_task" && e.titleLike && contentSimilarity(e.titleLike, d.newTaskTitleLike) >= 0.6);
    const pi = supported.pairs.find(p => p.expectedIndex === ei)?.proposalIndex;
    return pi !== undefined && !!link.draftRef && result.proposals[pi].draftRef === link.draftRef;
  };
  const correctDependencies: Count = { count: 0, total: expected.reduce((n, e) => n + list(e.dependsOn).length, 0) };
  const dependencyPrecision: Count = { count: 0, total: 0 };
  for (const [ei, e] of expected.entries()) {
    const pi = supported.pairs.find(p => p.expectedIndex === ei)?.proposalIndex;
    const p = pi === undefined ? undefined : result.proposals[pi];
    if (p?.action === e.action) for (const d of list(e.dependsOn)) {
      if ((p.dependsOn as Record<string, string>[]).some(link => matches(d, link))) correctDependencies.count++;
    }
  }
  const unwantedDependencies = result.proposals.flatMap((p, pi) => {
    const pair = supported.pairs.find(x => x.proposalIndex === pi);
    const e = pair ? expected[pair.expectedIndex] : undefined;
    return (p.dependsOn as Record<string, string>[]).flatMap(link => {
      dependencyPrecision.total++;
      if (e?.action === p.action && list(e.dependsOn).some(d => matches(d, link))) {
        dependencyPrecision.count++; return [];
      }
      return [{ candidate: p.draftRef ?? p.taskRef, dependency: link }];
    });
  });
  return { ...result, score, metrics: { correctAction, correctOwner, correctDependencies, dependencyPrecision, unwantedDependencies } };
}

export function auditExtraction(golden: GoldenCase, request: Request) {
  const expected = decisionExpectations(golden).filter(e => e.action !== "flag_no_action_items");
  const proposals: Proposal[] = request.state.candidates.map(c => ({ action: "create_task", title: c.claim, sourceQuote: c.sourceQuote }));
  const pairs = pairCalls(expected, proposals, { ...emptyPhase(golden), proposals });
  return {
    matched: pairs.pairs.length, total: expected.length,
    // Heuristic candidate matching, NOT a human-certified extraction score.
    possiblyMissing: pairs.unmatchedExpected.map(i => expected[i]), pairs: pairs.pairs,
  };
}
