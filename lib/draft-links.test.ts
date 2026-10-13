import { describe, it, expect } from "vitest";
import {
  planDraftRefs,
  bindDraftLinks,
  bindPayloadLinks,
  classifyDraftLink,
  draftLinkStatus,
  payloadDraftLinks,
  readDraftLinks,
  type SiblingDraft,
} from "./draft-links";
import { normaliseDraftDependsOn, normaliseDependsOn, draftDependsOn } from "./task-dependencies";

const create = (input: Record<string, unknown>) => ({ tool: "create_task_draft", input });
const update = (input: Record<string, unknown>) => ({ tool: "match_to_existing_task_draft", input });

describe("planDraftRefs (storage-time validation)", () => {
  it("keeps the model's refs and rewrites a { draftRef } blocker with the sibling's title", () => {
    const plan = planDraftRefs([
      create({ draftRef: "d1", title: "Add the metrics block" }),
      create({ draftRef: "d2", title: "Migrate the dashboards", dependsOn: [{ draftRef: "d1" }, { text: "platform sign-off" }] }),
    ]);
    expect(plan.refs).toEqual(["d1", "d2"]);
    expect(plan.dependsOn[1]).toEqual([{ draftRef: "d1", title: "Add the metrics block" }, { text: "platform sign-off" }]);
    expect(plan.dependsOn[0]).toBeUndefined();
    expect(plan.log).toEqual([]);
  });

  it("assigns refs to create drafts that have none, skipping refs already taken", () => {
    const plan = planDraftRefs([
      create({ title: "A" }),
      update({ taskId: 5, changes: { priority: "high" } }),
      create({ draftRef: "d1", title: "B" }),
      create({ draftRef: "d1", title: "C" }),
    ]);
    expect(plan.refs).toEqual(["d2", null, "d1", "d3"]);
    expect(plan.log).toEqual(['call 3: draftRef "d1" unusable or taken, assigned d3']);
  });

  it("an unknown ref falls back to text with the best label, or is dropped when there is none", () => {
    const plan = planDraftRefs([
      create({ draftRef: "d1", title: "A", dependsOn: [{ draftRef: "d9", text: "the security review" }, { draftRef: "d8" }] }),
    ]);
    expect(plan.dependsOn[0]).toEqual([{ text: "the security review" }]);
    expect(plan.log).toHaveLength(2);
  });

  it("drops a self-reference", () => {
    const plan = planDraftRefs([create({ draftRef: "d1", title: "A", dependsOn: [{ draftRef: "d1" }] })]);
    expect(plan.dependsOn[0]).toEqual([]);
    expect(plan.log[0]).toMatch(/itself/);
  });

  it("turns the ref that would close a loop into text", () => {
    const plan = planDraftRefs([
      create({ draftRef: "d1", title: "A", dependsOn: [{ draftRef: "d2" }] }),
      create({ draftRef: "d2", title: "B", dependsOn: [{ draftRef: "d1" }] }),
    ]);
    expect(plan.dependsOn[0]).toEqual([{ draftRef: "d2", title: "B" }]);
    expect(plan.dependsOn[1]).toEqual([{ text: "A" }]);
  });

  it("sees a loop through an existing task: the update waits on a draft that waits on that task", () => {
    const plan = planDraftRefs([
      create({ draftRef: "d1", title: "A", dependsOn: [{ taskId: 7 }] }),
      update({ taskId: 7, changes: { dependsOn: [{ draftRef: "d1" }] } }),
    ]);
    expect(plan.dependsOn[1]).toEqual([{ text: "A" }]);
  });

  it("an existing-task update may wait on a new draft", () => {
    const plan = planDraftRefs([
      create({ draftRef: "d1", title: "Close the vendor review" }),
      update({ taskId: 7, changes: { appendNotes: "x", dependsOn: [{ draftRef: "d1" }] } }),
    ]);
    expect(plan.dependsOn[1]).toEqual([{ draftRef: "d1", title: "Close the vendor review" }]);
  });

  it("an entry with a valid taskId is a task blocker even if it also names a ref", () => {
    const plan = planDraftRefs([
      create({ draftRef: "d1", title: "A" }),
      create({ draftRef: "d2", title: "B", dependsOn: [{ taskId: 4, draftRef: "d1" }] }),
    ]);
    expect(plan.dependsOn[1]).toEqual([{ taskId: 4, draftRef: "d1" }]);
    expect(normaliseDraftDependsOn(plan.dependsOn[1])).toEqual([{ taskId: 4 }]);
  });
});

describe("normaliseDraftDependsOn / bindDraftLinks", () => {
  it("keeps links on drafts, de-duplicated; the board normaliser drops them", () => {
    const raw = [{ draftId: 3, title: "A" }, { draftId: 3 }, { draftRef: "d2" }, { text: "x" }];
    expect(normaliseDraftDependsOn(raw)).toEqual([{ draftId: 3, title: "A" }, { draftRef: "d2" }, { text: "x" }]);
    expect(normaliseDependsOn(raw)).toEqual([{ text: "x" }]);
  });

  it("binds refs to row ids; a ref with no row becomes text", () => {
    const ids = new Map([["d1", 101]]);
    expect(bindDraftLinks([{ draftRef: "d1", title: "A" }, { draftRef: "d4", title: "Gone" }, { taskId: 2 }], ids, 102)).toEqual([
      { draftId: 101, draftRef: "d1", title: "A" },
      { text: "Gone" },
      { taskId: 2 },
    ]);
  });

  it("binds a create payload's dependsOn and an update's changes.dependsOn", () => {
    const ids = new Map([["d1", 101]]);
    expect(bindPayloadLinks({ title: "B", dependsOn: [{ draftRef: "d1", title: "A" }] }, ids, 102)).toEqual({
      title: "B",
      dependsOn: [{ draftId: 101, draftRef: "d1", title: "A" }],
    });
    expect(bindPayloadLinks({ taskId: 7, changes: { priority: "high", dependsOn: [{ draftRef: "d1", title: "A" }] } }, ids, 103)).toEqual({
      taskId: 7,
      changes: { priority: "high", dependsOn: [{ draftId: 101, draftRef: "d1", title: "A" }] },
    });
    expect(bindPayloadLinks({ title: "B", dependsOn: [{ text: "x" }] }, ids, 102)).toBeNull();
  });

  it("draftDependsOn keeps the links of a stored draft", () => {
    expect(draftDependsOn({ dependsOn: [{ draftId: 9, draftRef: "d1", title: "A" }, { taskId: 3 }] })).toEqual([
      { draftId: 9, draftRef: "d1", title: "A" },
      { taskId: 3 },
    ]);
  });
});

describe("classifyDraftLink (approval)", () => {
  const self = { id: 2, onboardingId: 63, sourceEventId: 500 };
  const sib = (over: Partial<SiblingDraft>): SiblingDraft => ({
    id: 1, status: "pending", onboardingId: 63, sourceEventId: 500, title: "Add the metrics block", appliedTask: null, ...over,
  });
  const link = { draftId: 1, draftRef: "d1", title: "Old title" };

  it("sibling pending → text placeholder with its current title", () => {
    expect(classifyDraftLink(link, sib({}), self)).toMatchObject({ dep: { text: "Add the metrics block" }, state: "pending" });
  });
  it("sibling applied with an open task → task blocker", () => {
    const r = classifyDraftLink(link, sib({ status: "applied", appliedTask: { id: 900, status: "Not started", onboardingId: 63 } }), self);
    expect(r).toMatchObject({ dep: { taskId: 900 }, state: "linked" });
  });
  it("sibling rejected → text, so the blocker is not lost", () => {
    expect(classifyDraftLink(link, sib({ status: "rejected" }), self)).toMatchObject({ dep: { text: "Add the metrics block" }, state: "kept_as_text" });
  });
  it("sibling applied but its task is done or deleted → nothing", () => {
    expect(classifyDraftLink(link, sib({ status: "applied", appliedTask: { id: 900, status: "Done", onboardingId: 63 } }), self).dep).toBeNull();
    expect(classifyDraftLink(link, sib({ status: "applied", appliedTask: null }), self).dep).toBeNull();
  });
  it("a draft from another meeting, or a missing one, is only a text blocker", () => {
    expect(classifyDraftLink(link, sib({ sourceEventId: 501 }), self)).toMatchObject({ dep: { text: "Add the metrics block" }, state: "kept_as_text" });
    expect(classifyDraftLink(link, null, self)).toMatchObject({ dep: { text: "Old title" }, state: "kept_as_text" });
  });
  it("a link to itself is skipped", () => {
    expect(classifyDraftLink({ draftId: 2 }, sib({ id: 2 }), self)).toMatchObject({ dep: null, reason: "self" });
  });
});

describe("display and stored-shape readers", () => {
  it("reads draftLinks and payload links defensively", () => {
    expect(readDraftLinks({ draftLinks: [{ draftId: 1, title: "A", state: "pending", dependencyId: 5 }, { draftId: "x" }, null] })).toEqual([
      { draftId: 1, title: "A", state: "pending", dependencyId: 5, blockedByTaskId: null },
    ]);
    expect(payloadDraftLinks({ changes: { dependsOn: [{ draftId: 4 }, { taskId: 2 }] } })).toEqual([{ draftId: 4 }]);
  });
  it("labels each state for the card", () => {
    expect(draftLinkStatus({ id: 1, status: "pending", title: "A", taskCode: null }).label).toBe("pending: links once both are approved");
    expect(draftLinkStatus({ id: 1, status: "applied", title: "A", taskCode: "RAY-12" }).label).toBe("created as RAY-12, will link");
    expect(draftLinkStatus({ id: 1, status: "rejected", title: "A", taskCode: null }).label).toBe("rejected, kept as a text blocker");
    expect(draftLinkStatus({ id: 1, status: "applied", title: "A", taskCode: "RAY-12" }, { draftId: 1, title: "A", state: "linked" }).label).toBe("linked to RAY-12");
    expect(draftLinkStatus({ id: 1, status: "rejected", title: "A", taskCode: null }, { draftId: 1, title: "A", state: "pending" }).label).toBe("rejected, kept as a text blocker");
  });
});
