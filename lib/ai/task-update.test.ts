import { describe, it, expect } from "vitest";
import {
  appendDatedNote,
  londonDate,
  meetingDay,
  noteSourceFor,
  noteStamp,
  readNoteSource,
  staleContactMessage,
  staleOwnerMessage,
  applyTaskUpdateOverrides,
  hasChanges,
  invalidChangeFields,
  isIsoDate,
  normaliseTaskUpdate,
  prepareStoredTaskUpdate,
  sanitiseChanges,
  subActionFor,
  toStoredTaskUpdatePayload,
} from "./task-update";

describe("normaliseTaskUpdate: legacy single-action payloads", () => {
  it("reprioritise → changes.priority", () => {
    expect(normaliseTaskUpdate({ taskId: 1, action: "reprioritise", newPriority: "high" })).toEqual({
      action: "reprioritise",
      changes: { priority: "high" },
    });
  });

  it("update_due_date → changes.dueDate", () => {
    expect(normaliseTaskUpdate({ taskId: 1, action: "update_due_date", newDueDate: "2026-06-26" })).toEqual({
      action: "update_due_date",
      changes: { dueDate: "2026-06-26" },
    });
  });

  it("a reassign with no target keeps its action and has no changes", () => {
    const n = normaliseTaskUpdate({ taskId: 1, action: "reassign", sourceQuote: "x" });
    expect(n).toEqual({ action: "reassign", changes: {} });
    expect(hasChanges(n.changes)).toBe(false);
  });

  it("ignores a legacy field that does not belong to the sub-action", () => {
    expect(normaliseTaskUpdate({ action: "reprioritise", newPriority: "low", newDueDate: "2026-06-26" }).changes).toEqual({
      priority: "low",
    });
  });

  it("drops malformed legacy values", () => {
    expect(normaliseTaskUpdate({ action: "reprioritise", newPriority: "urgent" })).toEqual({ action: "reprioritise", changes: {} });
    expect(normaliseTaskUpdate({ action: "update_due_date", newDueDate: "next Friday" }).changes).toEqual({});
  });

  it("keeps a retired sub-action (comment_only) readable", () => {
    expect(normaliseTaskUpdate({ action: "comment_only" })).toEqual({ action: "comment_only", changes: {} });
  });

  it("handles null / non-object payloads", () => {
    expect(normaliseTaskUpdate(null)).toEqual({ action: null, changes: {} });
    expect(normaliseTaskUpdate("nope")).toEqual({ action: null, changes: {} });
  });
});

describe("normaliseTaskUpdate: current `changes` shape", () => {
  it("derives `update` when several kinds of change are present", () => {
    const n = normaliseTaskUpdate({
      taskId: 4,
      changes: { ownerId: 6, dueDate: "2026-07-03", appendNotes: "  Scope: billing reports only.  " },
    });
    expect(n).toEqual({
      action: "update",
      changes: { ownerId: 6, dueDate: "2026-07-03", appendNotes: "Scope: billing reports only." },
    });
  });

  it("derives the single sub-action when only one kind is present", () => {
    expect(normaliseTaskUpdate({ changes: { priority: "high" } }).action).toBe("reprioritise");
    expect(normaliseTaskUpdate({ changes: { ownerId: 2, assigneeContactId: 9 } }).action).toBe("reassign");
    expect(normaliseTaskUpdate({ changes: { appendNotes: "hello" } }).action).toBe("add_notes");
  });

  it("`changes` wins over a legacy field saying something else", () => {
    expect(
      normaliseTaskUpdate({ action: "update_due_date", newDueDate: "2026-01-01", changes: { dueDate: "2026-02-02" } }).changes
    ).toEqual({ dueDate: "2026-02-02" });
  });

  it("coerces numeric-string ids and keeps an explicit null (clear)", () => {
    expect(sanitiseChanges({ ownerId: "7", assigneeContactId: null })).toEqual({ ownerId: 7, assigneeContactId: null });
    expect(sanitiseChanges({ ownerId: "abc", assigneeContactId: 1.5 })).toEqual({});
  });

  it("trims a timestamp due date down to the day, rejects impossible dates", () => {
    expect(sanitiseChanges({ dueDate: "2026-06-26T00:00:00.000Z" })).toEqual({ dueDate: "2026-06-26" });
    expect(sanitiseChanges({ dueDate: "2026-02-30" })).toEqual({});
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("drops blank notes", () => {
    expect(sanitiseChanges({ appendNotes: "   " })).toEqual({});
  });
});

describe("applyTaskUpdateOverrides", () => {
  it("an override `changes` replaces the stored set (removing a field removes the change)", () => {
    const stored = { taskId: 1, changes: { dueDate: "2026-07-03", appendNotes: "a" } };
    expect(applyTaskUpdateOverrides(stored, { changes: { dueDate: "2026-07-06" } })).toEqual({
      action: "update_due_date",
      changes: { dueDate: "2026-07-06" },
    });
  });

  it("legacy editor overrides still work on a legacy draft", () => {
    expect(applyTaskUpdateOverrides({ action: "update_due_date", newDueDate: "2026-06-26" }, { newDueDate: "2026-06-30" }))
      .toEqual({ action: "update_due_date", changes: { dueDate: "2026-06-30" } });
    expect(applyTaskUpdateOverrides({ action: "reassign" }, { newOwnerId: 6 }))
      .toEqual({ action: "reassign", changes: { ownerId: 6 } });
    expect(applyTaskUpdateOverrides({ action: "reassign" }, { newAssigneeContactId: null }))
      .toEqual({ action: "reassign", changes: { assigneeContactId: null } });
  });

  it("no overrides = the stored changes", () => {
    expect(applyTaskUpdateOverrides({ changes: { priority: "low" } }, {})).toEqual({
      action: "reprioritise",
      changes: { priority: "low" },
    });
  });

  it("an emptied editor keeps the stored action as the fallback label", () => {
    expect(applyTaskUpdateOverrides({ action: "reassign" }, { changes: {} })).toEqual({ action: "reassign", changes: {} });
  });
});

describe("toStoredTaskUpdatePayload", () => {
  it("folds legacy fields into changes and drops them", () => {
    expect(
      toStoredTaskUpdatePayload({ taskId: 3, action: "update_due_date", newDueDate: "2026-06-26", sourceQuote: "q", confidence: "high" })
    ).toEqual({ taskId: 3, action: "update_due_date", changes: { dueDate: "2026-06-26" }, sourceQuote: "q", confidence: "high" });
  });

  it("stores a multi-field update with action `update`", () => {
    const stored = toStoredTaskUpdatePayload({ taskId: 3, changes: { priority: "high", dueDate: "2026-06-26" }, sourceQuote: "q" });
    expect(stored).toMatchObject({ action: "update", changes: { priority: "high", dueDate: "2026-06-26" } });
  });
});

describe("subActionFor / appendDatedNote", () => {
  it("falls back when there are no changes", () => {
    expect(subActionFor({}, "reassign")).toBe("reassign");
    expect(subActionFor({})).toBeNull();
  });

  it("appends on a new stamped line and never overwrites", () => {
    expect(appendDatedNote("Original note.", "Scope agreed.", "2026-06-18")).toBe("Original note.\n[2026-06-18] Scope agreed.");
    expect(appendDatedNote("Original note.\n\n", "Scope agreed.", "2026-06-18, call with Acme")).toBe(
      "Original note.\n[2026-06-18, call with Acme] Scope agreed."
    );
    expect(appendDatedNote("", "Scope agreed.", "2026-06-18")).toBe("[2026-06-18] Scope agreed.");
    expect(appendDatedNote(null, "  Scope agreed. ", "2026-06-18")).toBe("[2026-06-18] Scope agreed.");
  });
});

describe("prepareStoredTaskUpdate (draft writer)", () => {
  const valid = { vendorUserIds: new Set([6, 8]), contactIds: new Set([21]) };

  it("drops ids outside the context and re-derives the action", () => {
    const r = prepareStoredTaskUpdate(
      { taskId: 3, changes: { ownerId: 99, dueDate: "2026-06-26" }, sourceQuote: "q", confidence: "medium" },
      valid
    );
    expect(r.dropped).toEqual(["ownerId=99"]);
    expect(r.payload).toEqual({
      taskId: 3,
      action: "update_due_date",
      changes: { dueDate: "2026-06-26" },
      sourceQuote: "q",
      confidence: "medium",
    });
  });

  it("skips an update with nothing valid left to change", () => {
    expect(prepareStoredTaskUpdate({ taskId: 3, changes: { assigneeContactId: 5 } }, valid).payload).toBeNull();
    expect(prepareStoredTaskUpdate({ taskId: 3, changes: {} }, valid).payload).toBeNull();
  });

  it("keeps a legacy flag-only reassign", () => {
    expect(prepareStoredTaskUpdate({ taskId: 3, action: "reassign", sourceQuote: "q" }, valid).payload).toEqual({
      taskId: 3,
      action: "reassign",
      changes: {},
      sourceQuote: "q",
    });
  });

  it("keeps every valid field of a multi-field update", () => {
    const r = prepareStoredTaskUpdate(
      { taskId: 3, changes: { ownerId: 8, assigneeContactId: 21, priority: "high", appendNotes: "Audience: finance team." } },
      valid
    );
    expect(r.payload).toMatchObject({
      action: "update",
      changes: { ownerId: 8, assigneeContactId: 21, priority: "high", appendNotes: "Audience: finance team." },
    });
  });
});

describe("note stamp: meeting date + source, London-date fallback", () => {
  it("takes the meeting's day in Europe/London, not the UTC day", () => {
    // 00:30 in London (BST) on the 19th is 23:30Z on the 18th.
    expect(meetingDay("2026-06-18T23:30:00Z")).toBe("2026-06-19");
    expect(meetingDay("2026-06-19T00:30:00+01:00")).toBe("2026-06-19");
    // In winter London is UTC.
    expect(meetingDay("2026-01-15T23:30:00Z")).toBe("2026-01-15");
    expect(meetingDay("2026-06-18")).toBe("2026-06-18");
    expect(meetingDay("not a date")).toBeNull();
    expect(meetingDay("2026-13-40T10:00:00Z")).toBeNull();
  });

  it("labels the source 'call with <Company>', else the meeting title, kept short", () => {
    expect(noteSourceFor({ date: "2026-06-18T10:00:00Z", title: "Weekly sync" }, "Acme")).toEqual({
      date: "2026-06-18",
      label: "call with Acme",
    });
    expect(noteSourceFor({ date: "2026-06-18T10:00:00Z", title: "Weekly sync" }, null)).toEqual({
      date: "2026-06-18",
      label: "Weekly sync",
    });
    const long = noteSourceFor({ date: "2026-06-18", title: "A very long meeting title that goes on and on and on" });
    expect(long!.label.length).toBeLessThanOrEqual(40);
    expect(noteSourceFor({ title: "No date" }, "Acme")).toBeNull();
  });

  it("stamps with the source, or the London date when there is none", () => {
    expect(noteStamp({ date: "2026-06-18", label: "call with Acme" }, new Date())).toBe("2026-06-18, call with Acme");
    // 23:30 UTC on 30 Jun is 00:30 on 1 Jul in London (BST).
    expect(noteStamp(null, new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    // In winter London is UTC.
    expect(londonDate(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
  });

  it("reads a stored noteSource only when it is well formed", () => {
    expect(readNoteSource({ date: "2026-06-18", label: "call with Acme" })).toEqual({ date: "2026-06-18", label: "call with Acme" });
    expect(readNoteSource({ date: "18 June", label: "x" })).toBeNull();
    expect(readNoteSource({ date: "2026-06-18", label: " " })).toBeNull();
    expect(readNoteSource(undefined)).toBeNull();
  });
});

describe("removing a due date", () => {
  it("dueDate: null is a change (remove), distinct from absent (leave)", () => {
    expect(sanitiseChanges({ dueDate: null })).toEqual({ dueDate: null });
    expect(sanitiseChanges({})).toEqual({});
    expect(normaliseTaskUpdate({ changes: { dueDate: null } })).toEqual({ action: "update_due_date", changes: { dueDate: null } });
    expect(hasChanges({ dueDate: null })).toBe(true);
  });
});

describe("stale person messages", () => {
  it("names the person when known, plain copy otherwise, no em dashes", () => {
    expect(staleOwnerMessage("Sam Doe")).toBe("Sam Doe is no longer in the workspace: pick a new owner or leave unassigned");
    expect(staleOwnerMessage(null)).toBe("The proposed owner is no longer in the workspace: pick a new owner or leave unassigned");
    expect(staleContactMessage("Pat")).toBe("Pat is no longer on this onboarding: pick a new assignee or leave unassigned");
    expect(staleOwnerMessage("x") + staleContactMessage("y")).not.toMatch(/\u2014/);
  });
});

describe("dependsOn on an existing-task update (GAPS-PLAN feature 2)", () => {
  it("sanitises dependsOn and folds a legacy blockedByTaskId in", () => {
    expect(sanitiseChanges({ dependsOn: [{ text: " security review " }, { taskId: "7" }] })).toEqual({
      dependsOn: [{ text: "security review" }, { taskId: 7 }],
    });
    expect(sanitiseChanges({ blockedByTaskId: 4 })).toEqual({ dependsOn: [{ taskId: 4 }] });
    expect(sanitiseChanges({ dependsOn: [] })).toEqual({});
  });

  it("a dependency-only update is action add_dependency; with notes it is update", () => {
    expect(normaliseTaskUpdate({ changes: { dependsOn: [{ text: "x" }] } }).action).toBe("add_dependency");
    expect(normaliseTaskUpdate({ changes: { dependsOn: [{ text: "x" }], appendNotes: "y" } }).action).toBe("update");
    expect(hasChanges({ dependsOn: [{ text: "x" }] })).toBe(true);
  });

  it("flags malformed dependsOn, accepts an empty list", () => {
    expect(invalidChangeFields({ dependsOn: [{ taskId: "abc" }] })).toEqual(["dependsOn"]);
    expect(invalidChangeFields({ dependsOn: [] })).toEqual([]);
    expect(invalidChangeFields({ blockedByTaskId: 5 })).toEqual([]);
    expect(invalidChangeFields({ blockedByTaskId: "x" })).toEqual(["blockedByTaskId"]);
  });

  it("the draft writer drops task blockers the model was not shown, and the task itself", () => {
    const valid = { vendorUserIds: new Set([6]), contactIds: new Set<number>(), openTaskIds: new Set([3, 4]) };
    const r = prepareStoredTaskUpdate(
      { taskId: 3, changes: { dependsOn: [{ taskId: 3 }, { taskId: 4 }, { taskId: 99 }, { text: "legal ok" }] } },
      valid
    );
    expect(r.dropped).toEqual(["dependsOn.taskId=3", "dependsOn.taskId=99"]);
    expect(r.payload).toMatchObject({ action: "add_dependency", changes: { dependsOn: [{ taskId: 4 }, { text: "legal ok" }] } });
  });

  it("an update whose only blockers are all invalid is skipped", () => {
    const valid = { vendorUserIds: new Set<number>(), contactIds: new Set<number>(), openTaskIds: new Set([4]) };
    expect(prepareStoredTaskUpdate({ taskId: 3, changes: { dependsOn: [{ taskId: 99 }] } }, valid).payload).toBeNull();
  });

  it("editor overrides with a changes object replace the stored dependsOn", () => {
    const out = applyTaskUpdateOverrides(
      { taskId: 3, changes: { dependsOn: [{ text: "a" }, { text: "b" }] } },
      { changes: { dependsOn: [{ text: "b" }] } }
    );
    expect(out.changes).toEqual({ dependsOn: [{ text: "b" }] });
  });
});
