import { describe, expect, it } from "vitest";
import {
  contentSimilarity,
  count,
  formatCount,
  normalizeLoose,
  optimalAssignment,
  pairCalls,
  phraseFound,
  quoteAppearsIn,
  quoteMatches,
  scoreCase,
  scorePhase,
  stem,
  summarise,
  titleSimilarity,
} from "./scoring";
import type { CaseActual, ExpectedToolCall, PhaseActual, Proposal } from "./harness/types";

const TRANSCRIPT = [
  "I'll draft the incremental model config and have it in a PR by Thursday the 18th.",
  "I'll add the Quarry static IPs to our warehouse network policy.",
  "At some point we should think about row-level security for the sales team, after the pilot.",
].join("\n");

function phase(proposals: Proposal[], extra: Partial<PhaseActual> = {}): PhaseActual {
  return {
    proposals,
    rawCalls: [],
    boardRefs: ["t1", "t2", "t3"],
    openRefs: ["t1", "t2"],
    boardTasks: [
      { ref: "t1", title: "Configure Okta SAML SSO", status: "Not started", ownerName: "Dmitri Volkov" },
      { ref: "t2", title: "Connect Snowflake warehouse to Quarry", status: "In progress", ownerName: "Jonas Beck" },
      { ref: "t3", title: "Kickoff call", status: "Done", ownerName: "Maya Lindqvist" },
    ],
    ...extra,
  };
}

const create = (over: Partial<Proposal>): Proposal => ({ action: "create_task", draftId: 1, ...over });
const sources = { transcript: TRANSCRIPT, actionItemsText: "Theo to open PR by June 18" };

describe("text helpers", () => {
  it("normalises case, punctuation and number words", () => {
    expect(normalizeLoose("Pick FOUR of the six — dashboards!")).toBe("pick 4 of the 6 dashboards");
  });

  it("finds notes phrases loosely", () => {
    expect(phraseFound("four", "the guild picks 4 of 6")).toBe(true);
    expect(phraseFound("ANALYTICS schema", "read-only on the analytics schema")).toBe(true);
    expect(phraseFound("not the raw PHI", "Not raw PHI; de-identified marts only")).toBe(true);
    expect(phraseFound("snake_case", "use snake case names")).toBe(true);
    expect(phraseFound("six dashboards", "the parity list")).toBe(false);
    // Whole-word substring: "tag" must not hit "stage" by accident.
    expect(phraseFound("tag", "stage the models")).toBe(false);
  });

  it("checks quotes against the transcript, ignoring punctuation", () => {
    expect(quoteAppearsIn("I’ll add the Quarry static IPs", TRANSCRIPT)).toBe(true);
    expect(quoteAppearsIn("I'll add the Vector static IPs", TRANSCRIPT)).toBe(false);
    expect(quoteAppearsIn("", TRANSCRIPT)).toBe(false);
  });

  it("matches a draft quote that contains the expected phrase, or a long piece of it", () => {
    expect(quoteMatches("Yes. I'll add the Quarry static IPs to our policy today", "add the Quarry static IPs")).toBe(true);
    expect(quoteMatches("add the Quarry static IPs to our", "I'll add the Quarry static IPs to our warehouse network policy")).toBe(true);
    expect(quoteMatches("static IPs", "I'll add the Quarry static IPs to our warehouse network policy")).toBe(false);
  });

  it("similarity ignores stopwords for pairing but keeps the validator's plain Dice", () => {
    expect(contentSimilarity("Add the static IPs", "Add static IPs to the policy")).toBeCloseTo(6 / 7, 3);
    expect(titleSimilarity("a b", "a b")).toBe(1);
    expect(contentSimilarity("", "x")).toBe(0);
  });

  it("formats counts as count and ratio, never a bare percentage", () => {
    expect(formatCount(count(3, 4))).toBe("3 of 4 (75%)");
    expect(formatCount(count(0, 0))).toBe("n/a (0 applicable)");
  });
});

describe("pairCalls", () => {
  it("pairs existing-task expectations by board ref even when the action differs", () => {
    const expected: ExpectedToolCall[] = [{ action: "update_status", existingTaskRef: "t2", newStatus: "Done" }];
    const proposals: Proposal[] = [{ action: "match_existing", draftId: 7, taskRef: "t2", updateKind: "reprioritise" }];
    const r = pairCalls(expected, proposals, phase(proposals));
    expect(r.pairs).toEqual([{ expectedIndex: 0, proposalIndex: 0, score: 1, by: "ref" }]);
  });

  it("pairs creates by title, best first, and leaves weak matches unpaired", () => {
    const expected: ExpectedToolCall[] = [
      { action: "create_task", titleLike: "Add Quarry static IPs to warehouse network policy" },
      { action: "create_task", titleLike: "Draft incremental model config for usage events" },
    ];
    const proposals = [
      create({ draftId: 1, title: "Draft the incremental model config PR" }),
      create({ draftId: 2, title: "Allow-list Quarry static IPs in the warehouse network policy" }),
      create({ draftId: 3, title: "Plan the team offsite" }),
    ];
    const r = pairCalls(expected, proposals, phase(proposals));
    expect(r.pairs.map((p) => [p.expectedIndex, p.proposalIndex])).toEqual(expect.arrayContaining([[0, 1], [1, 0]]));
    expect(r.unmatchedProposed).toEqual([2]);
  });

  it("lets a matching quote rescue a differently worded title", () => {
    const expected: ExpectedToolCall[] = [
      { action: "create_task", titleLike: "Row-level security for the sales team", sourceQuoteContains: "think about row-level security for the sales team" },
    ];
    const reworded = create({ title: "Look into sales access controls", sourceQuote: "At some point we should think about row-level security for the sales team" });
    expect(pairCalls(expected, [reworded], phase([reworded])).pairs).toHaveLength(1);
    const noQuote = create({ title: "Look into sales access controls" });
    expect(pairCalls(expected, [noQuote], phase([noQuote])).pairs).toHaveLength(0);
  });

  it("pairs a duplicate create with an expected existing-task update via the board title", () => {
    const expected: ExpectedToolCall[] = [{ action: "match_existing", existingTaskRef: "t1", newPriority: "high" }];
    const dup = create({ title: "Configure Okta SAML SSO for Modal" });
    const r = pairCalls(expected, [dup], phase([dup]));
    expect(r.pairs).toHaveLength(1);
  });

  it("pairs flag_no_action_items with a flag", () => {
    const flag: Proposal = { action: "flag_no_action_items", draftId: null };
    const r = pairCalls([{ action: "flag_no_action_items" }], [flag], phase([flag]));
    expect(r.pairs[0].by).toBe("flag");
  });
});

describe("scorePhase", () => {
  it("scores fields on paired creates", () => {
    const expected: ExpectedToolCall[] = [
      {
        action: "create_task",
        titleLike: "Circulate pilot dashboard list to analytics guild",
        owner: "customer",
        assignee: "Priya Raman",
        dueDate: "2026-06-19",
        priority: "high",
        kind: "commitment",
        notesContains: ["four", "six"],
        dependsOn: { existingTaskRef: "t2" },
      },
    ];
    const p = create({
      title: "Circulate the pilot dashboard list to the analytics guild",
      ownerSide: "customer",
      assigneeContactName: "Priya Raman",
      ownerName: "Maya Lindqvist",
      dueDate: "2026-06-19",
      priority: "medium",
      notes: "Guild picks 4 of the shortlisted dashboards",
      blockedByRef: "t2",
      sourceQuote: "I'll add the Quarry static IPs",
    });
    const s = scorePhase(expected, phase([p]), sources);
    const c = s.calls[0];
    expect(c.checks.owner?.pass).toBe(true);
    expect(c.checks.assignee?.pass).toBe(true);
    expect(c.checks.dueDate?.pass).toBe(true);
    expect(c.checks.priority).toEqual({ expected: "high", actual: "medium", pass: false });
    expect(c.notes).toEqual({ found: ["four"], missing: ["six"] });
    expect(s.totals.notesPhrases).toEqual(count(1, 2));
    expect(s.totals.dependencies).toEqual(count(1, 1));
    expect(s.totals.kindRecall.commitment).toEqual(count(1, 1));
    expect(s.totals.recall).toEqual(count(1, 1));
    expect(s.totals.precision).toEqual(count(1, 1));
  });

  it("treats an expected null due date as 'no date' and an empty string as none", () => {
    const expected: ExpectedToolCall[] = [{ action: "create_task", titleLike: "Row-level security for the sales team", dueDate: null }];
    const ok = scorePhase(expected, phase([create({ title: "Row-level security for the sales team", dueDate: "" })]), sources);
    expect(ok.totals.dueDate).toEqual(count(1, 1));
    const bad = scorePhase(expected, phase([create({ title: "Row-level security for the sales team", dueDate: "2026-07-01" })]), sources);
    expect(bad.totals.dueDate).toEqual(count(0, 1));
  });

  it("does not score a due date when the field is absent from the answer key", () => {
    const s = scorePhase([{ action: "create_task", titleLike: "Review the PR" }], phase([create({ title: "Review the PR", dueDate: "2026-06-10" })]), sources);
    expect(s.totals.dueDate).toEqual(count(0, 0));
  });

  it("checks an existing-task assignee against the board owner (a check, not a reassignment)", () => {
    const expected: ExpectedToolCall[] = [{ action: "match_existing", existingTaskRef: "t1", assignee: "Dmitri Volkov", newDueDate: "2026-06-26" }];
    const p: Proposal = { action: "match_existing", draftId: 2, taskRef: "t1", updateKind: "update_due_date", newDueDate: "2026-06-26" };
    const s = scorePhase(expected, phase([p]), sources);
    expect(s.calls[0].checks.assignee?.pass).toBe(true);
    expect(s.calls[0].checks.dueDate?.pass).toBe(true);
    const reassign: Proposal = { ...p, updateKind: "reassign" };
    expect(scorePhase(expected, phase([reassign]), sources).calls[0].checks.assignee?.pass).toBe(false);
  });

  it("keeps gap expectations out of the headline and counts them per code", () => {
    const expected: ExpectedToolCall[] = [
      {
        action: "match_existing",
        existingTaskRef: "t1",
        notesContains: ["read-only"],
        gap: "existing_task_notes",
        dependsOn: { newTaskTitleLike: "Close the security review", gap: ["existing_task_dependency", "depends_on_new_draft"] },
      },
      {
        action: "create_task",
        titleLike: "Row-level security for the sales team",
        dependsOn: { freeText: "after the pilot", gap: "free_text_dependency" },
      },
      { action: "create_task", titleLike: "Close the security review" },
    ];
    const proposals: Proposal[] = [
      { action: "match_existing", draftId: 1, taskRef: "t1", updateKind: "reprioritise" },
      create({ draftId: 2, title: "Row-level security for the sales team", notes: "Parked until after the pilot." }),
      create({ draftId: 3, title: "Close the security review" }),
    ];
    const s = scorePhase(expected, phase(proposals), sources);
    // The notes phrase on the existing task is a gap, not a headline notes miss.
    expect(s.totals.notesPhrases).toEqual(count(0, 0));
    expect(s.totals.dependencies).toEqual(count(0, 0));
    expect(s.totals.gaps).toEqual(count(1, 3));
    expect(s.totals.gapsByCode).toEqual({
      existing_task_notes: count(0, 1),
      existing_task_dependency: count(0, 1),
      depends_on_new_draft: count(0, 1),
      free_text_dependency: count(1, 1), // the blocker went into the notes, as today's prompt asks
    });
  });

  it("meets a draft-to-draft dependency once drafts carry structured dependsOn (future feature)", () => {
    const expected: ExpectedToolCall[] = [
      { action: "create_task", titleLike: "Refactor PR open" },
      { action: "create_task", titleLike: "Review the refactor PR", dependsOn: { newTaskTitleLike: "Refactor PR open", gap: "depends_on_new_draft" } },
    ];
    const proposals: Proposal[] = [
      create({ draftId: 1, title: "Open the refactor PR", draftRef: "d1" }),
      create({ draftId: 2, title: "Review the refactor PR", dependsOn: [{ draftRef: "d1" }] }),
    ];
    expect(scorePhase(expected, phase(proposals), sources).totals.gaps).toEqual(count(1, 1));
  });

  it("an unpaired call misses its gap expectations too", () => {
    const expected: ExpectedToolCall[] = [{ action: "create_task", titleLike: "Row-level security", dependsOn: { freeText: "pilot", gap: "free_text_dependency" } }];
    expect(scorePhase(expected, phase([]), sources).totals.gaps).toEqual(count(0, 1));
  });

  it("reports groundedness, invalid cited ids and duplicates of open board tasks", () => {
    const proposals = [
      create({ draftId: 1, title: "Connect Snowflake warehouse to Quarry", sourceQuote: "I'll add the Quarry static IPs" }),
      create({ draftId: 2, title: "Something new", sourceQuote: "Theo to open PR by June 18" }),
    ];
    const s = scorePhase([], phase(proposals, {
      rawCalls: [
        { tool: "match_to_existing_task_draft", taskId: 11, taskRef: "t1" },
        { tool: "match_to_existing_task_draft", taskId: 999, taskRef: null },
      ],
    }), sources);
    expect(s.totals.groundedQuotes).toEqual(count(1, 2));
    expect(s.groundedness.quotesFromActionItemsOnly).toBe(1);
    expect(s.totals.citedIdsValid).toEqual(count(1, 2));
    expect(s.groundedness.citedIdViolations).toEqual(["match_to_existing_task_draft.taskId=999"]);
    expect(s.totals.duplicates).toEqual(count(1, 2));
    expect(s.totals.precision).toEqual(count(0, 2));
  });

  it("recall per kind", () => {
    const expected: ExpectedToolCall[] = [
      { action: "create_task", titleLike: "Circle back with Derek", kind: "vendor_reminder" },
      { action: "create_task", titleLike: "Row-level security for sales", kind: "parked_for_later" },
    ];
    const s = scorePhase(expected, phase([create({ title: "Circle back with Derek about the pilot" })]), sources);
    expect(s.totals.kindRecall.vendor_reminder).toEqual(count(1, 1));
    expect(s.totals.kindRecall.parked_for_later).toEqual(count(0, 1));
  });
});

describe("scoreCase", () => {
  const base = (over: Partial<CaseActual>): CaseActual => ({
    match: { companyPrefix: "MDL", ambiguous: false, matchedBy: "domain" },
    transcript: TRANSCRIPT,
    actionItemsText: "",
    initial: phase([]),
    ...over,
  });

  it("scores a clear match by company prefix", () => {
    expect(scoreCase({ match: { companyPrefix: "MDL" }, toolCalls: [] }, base({})).match.pass).toBe(true);
    expect(scoreCase({ match: { companyPrefix: "ASH" }, toolCalls: [] }, base({})).match.pass).toBe(false);
    expect(scoreCase({ match: { ambiguous: true }, toolCalls: [] }, base({})).match.pass).toBe(false);
  });

  it("ambiguous: holds drafts until assignment, then scores afterAssign into the totals", () => {
    const actual = base({
      match: { companyPrefix: null, ambiguous: true, matchedBy: null },
      afterAssign: { ...phase([create({ title: "Share a draft of the executive dashboard" })]), companyPrefix: "MDL" },
    });
    const s = scoreCase(
      {
        match: { ambiguous: true },
        toolCalls: [],
        afterAssign: { companyPrefix: "MDL", toolCalls: [{ action: "create_task", titleLike: "Share draft of the executive dashboard" }, { action: "create_task", titleLike: "Finish tagging the exposure models" }] },
      },
      actual
    );
    expect(s.match.pass).toBe(true);
    expect(s.heldBeforeAssign).toEqual({ pass: true, drafts: 0 });
    expect(s.afterAssign?.totals.recall).toEqual(count(1, 2));
    expect(s.totals.recall).toEqual(count(1, 2));
  });

  it("re-delivery passes only when deduped with no new drafts", () => {
    const ok = scoreCase({ match: { companyPrefix: "MDL" }, toolCalls: [] }, base({ redelivery: { deduped: true, newDrafts: 0 } }));
    expect(ok.dedup?.pass).toBe(true);
    const bad = scoreCase({ match: { companyPrefix: "MDL" }, toolCalls: [] }, base({ redelivery: { deduped: false, newDrafts: 2 } }));
    expect(bad.dedup?.pass).toBe(false);
  });

  it("summarise adds counts across cases and counts errored cases separately", () => {
    const a = scoreCase({ match: { companyPrefix: "MDL" }, toolCalls: [{ action: "create_task", titleLike: "Review the PR" }] }, base({ initial: phase([create({ title: "Review the PR" })]) }));
    const b = scoreCase({ match: { companyPrefix: "MDL" }, toolCalls: [{ action: "create_task", titleLike: "Write the runbook" }] }, base({}));
    const s = summarise([a, b, null]);
    expect(s.errors).toBe(1);
    expect(s.match).toEqual(count(2, 2));
    expect(s.totals.recall).toEqual(count(1, 2));
    expect(s.totals.precision).toEqual(count(1, 1));
  });
});

describe("review fixes (2026-10-12)", () => {
  it("stems plurals and simple tenses so they meet", () => {
    expect(stem("dashboards")).toBe(stem("dashboard"));
    expect(stem("participants")).toBe(stem("participant"));
    expect(stem("tagged")).toBe(stem("tag"));
    expect(stem("tagging")).toBe(stem("tag"));
    expect(stem("shared")).toBe(stem("share"));
    expect(stem("processes")).toBe(stem("process"));
    expect(stem("status")).toBe("status");
    expect(stem("added")).toBe(stem("add"));
    expect(contentSimilarity("Update customer on additional workshop participants", "Update the customer on the additional workshop participant")).toBe(1);
  });

  it("notes fallback needs the content words in order and close together", () => {
    expect(phraseFound("no raw layer", "the layer is raw, there is no time")).toBe(false);
    expect(phraseFound("no raw layer", "read-only, no raw-layer access")).toBe(true);
    expect(phraseFound("Maya will review", "Maya to review the draft")).toBe(true);
    expect(phraseFound("Maya will review", "review with the team, then send to Maya")).toBe(false);
    expect(phraseFound("four of the six", "the guild picks 4 of the 6 shortlisted dashboards")).toBe(true);
    expect(phraseFound("four of the six", "six dashboards shortlisted, four go to the pilot")).toBe(false);
    expect(phraseFound("weekly grain", "use a weekly grain for exec numbers")).toBe(true);
    expect(phraseFound("pilot group", "pilot user group")).toBe(true); // one token between is fine
  });

  it("optimal assignment beats order-dependent greedy", () => {
    // E0 likes P0 best, but E1 can only take P0: greedy would leave E1 unpaired.
    const edges = [
      { ei: 0, pi: 0, score: 0.9 },
      { ei: 0, pi: 1, score: 0.5 },
      { ei: 1, pi: 0, score: 0.8 },
    ];
    const chosen = optimalAssignment(edges, [0, 1], [0, 1]);
    expect(chosen.map((e) => [e.ei, e.pi]).sort()).toEqual([[0, 1], [1, 0]]);
  });

  it("pairs close titles in one case by best total, not by order", () => {
    const expected: ExpectedToolCall[] = [
      { action: "create_task", titleLike: "Send the SSO troubleshooting guide" },
      { action: "create_task", titleLike: "Forward the SSO troubleshooting guide to IT" },
    ];
    const proposals = [
      create({ draftId: 1, title: "Forward SSO troubleshooting guide to the IT team" }),
      create({ draftId: 2, title: "Send SSO troubleshooting guide to customer" }),
    ];
    const r = pairCalls(expected, proposals, phase(proposals));
    expect(r.pairs.map((p) => [p.expectedIndex, p.proposalIndex]).sort()).toEqual([[0, 1], [1, 0]]);
  });

  it("uses titleAlternatives for pairing", () => {
    const expected: ExpectedToolCall[] = [{ action: "create_task", titleLike: "Revisit with Derek", titleAlternatives: ["Circle back with Derek"] }];
    const p = create({ title: "Circle back with Derek on the pilot" });
    expect(pairCalls(expected, [p], phase([p])).pairs).toHaveLength(1);
  });

  it("gap credit only for the expected action, and existing-task notes only via appendNotes", () => {
    const expected: ExpectedToolCall[] = [
      { action: "match_existing", existingTaskRef: "t2", notesContains: ["read-only"], gap: "existing_task_notes" },
    ];
    const dupCreate = create({ title: "Connect Snowflake warehouse to Quarry", notes: "read-only access" });
    expect(scorePhase(expected, phase([dupCreate]), sources).totals.gaps).toEqual(count(0, 1));
    const notesField: Proposal = { action: "match_existing", draftId: 2, taskRef: "t2", updateKind: "reprioritise", notes: "read-only access" };
    expect(scorePhase(expected, phase([notesField]), sources).totals.gaps).toEqual(count(0, 1));
    const appended: Proposal = { ...notesField, notes: null, appendNotes: "read-only access" };
    expect(scorePhase(expected, phase([appended]), sources).totals.gaps).toEqual(count(1, 1));
  });

  it("leaves an unchanged-owner check out of the assignee metric", () => {
    const expected: ExpectedToolCall[] = [{ action: "match_existing", existingTaskRef: "t1", assignee: "Dmitri Volkov" }];
    const p: Proposal = { action: "match_existing", draftId: 2, taskRef: "t1", updateKind: "update_due_date", newDueDate: "2026-06-26" };
    const s = scorePhase(expected, phase([p]), sources);
    expect(s.totals.assignee).toEqual(count(0, 0));
    expect(s.calls[0].checks.assignee).toMatchObject({ pass: true, scored: false });
    // An answer key that expects a different owner is always counted.
    const change = scorePhase([{ ...expected[0], assignee: "Priya Raman" }], phase([p]), sources);
    expect(change.totals.assignee).toEqual(count(0, 1));
  });

  it("a cited id on a Done board task is not valid", () => {
    const s = scorePhase([], phase([], { rawCalls: [{ tool: "update_task_status_draft", taskId: 13, taskRef: "t3" }] }), sources);
    expect(s.totals.citedIdsValid).toEqual(count(0, 1));
  });
});
