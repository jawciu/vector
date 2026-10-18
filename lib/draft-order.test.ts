import { describe, expect, it } from "vitest";
import { orderDraftsByDependencies } from "./draft-order";

const draft = (id: number, payload: Record<string, unknown> = {}, extra = {}) => ({
  id, action: "create_task", sourceEventId: 10, onboardingId: 4, payload, ...extra,
});
const ids = (list: ReturnType<typeof draft>[]) => orderDraftsByDependencies(list).map((d) => d.id);

describe("prerequisite-first draft display", () => {
  it("puts the metrics draft before the dashboard that depends on it", () => {
    expect(ids([draft(2, { dependsOn: [{ draftId: 1 }] }), draft(1)])).toEqual([1, 2]);
  });

  it("keeps an already correct order and leaves its inputs untouched", () => {
    const list = [draft(1), draft(2, { dependsOn: [{ draftId: 1 }] }), draft(3)];
    const before = structuredClone(list);
    expect(orderDraftsByDependencies(list)).toEqual(list);
    expect(list).toEqual(before);
  });

  it("orders a chain and brings its prerequisites together before unrelated cards", () => {
    expect(ids([
      draft(3, { dependsOn: [{ draftId: 2 }] }), draft(4),
      draft(2, { dependsOn: [{ draftId: 1 }] }), draft(1), draft(5),
    ])).toEqual([1, 2, 3, 4, 5]);
  });

  it("shows all prerequisites once when several tasks share them", () => {
    expect(ids([
      draft(3, { dependsOn: [{ draftId: 1 }, { draftId: 2 }] }),
      draft(4, { dependsOn: [{ draftId: 1 }] }), draft(2), draft(1),
    ])).toEqual([1, 2, 3, 4]);
  });

  it("also resolves draft refs when a bound draft id is not present", () => {
    expect(ids([draft(2, { dependsOn: [{ draftRef: "d1" }] }), draft(1, { draftRef: "d1" })])).toEqual([1, 2]);
  });

  it("reads proposed dependencies from existing-task updates", () => {
    expect(ids([
      draft(2, { taskId: 50, changes: { dependsOn: [{ draftId: 1 }] } }, { action: "match_existing" }),
      draft(1),
    ])).toEqual([1, 2]);
  });

  it("puts a prerequisite task's update before a draft that waits on that task", () => {
    expect(ids([
      draft(2, { dependsOn: [{ taskId: 50 }] }),
      draft(1, { taskId: 50, changes: { priority: "high" } }, { action: "match_existing" }),
    ])).toEqual([1, 2]);
  });

  it("does not guess relationships from text, missing references or matching titles", () => {
    expect(ids([
      draft(2, { dependsOn: [{ text: "Metrics" }, { draftId: 999 }] }),
      draft(1, { title: "Metrics" }), draft(3),
    ])).toEqual([2, 1, 3]);
  });

  it("does not move cards across meetings or onboardings, even with malformed references", () => {
    expect(ids([
      draft(3, { dependsOn: [{ draftId: 1 }, { draftId: 2 }] }),
      draft(1, {}, { sourceEventId: 11 }), draft(2, {}, { onboardingId: 5 }),
    ])).toEqual([3, 1, 2]);
  });

  it("preserves every card in its original order for a cycle and ignores self-links", () => {
    expect(ids([draft(2, { dependsOn: [{ draftId: 1 }] }), draft(1, { dependsOn: [{ draftId: 2 }] })])).toEqual([2, 1]);
    expect(ids([draft(1, { dependsOn: [{ draftId: 1 }] }), draft(2)])).toEqual([1, 2]);
  });

  it("does not choose arbitrarily between duplicate draft refs", () => {
    expect(ids([
      draft(3, { dependsOn: [{ draftRef: "d1" }] }),
      draft(2, { draftRef: "d1" }), draft(1, { draftRef: "d1" }),
    ])).toEqual([3, 2, 1]);
  });
});
