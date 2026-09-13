/**
 * The restore-state diff. Fixtures rather than a database: the interesting
 * behaviour is entirely in what the planner decides to touch, and what it
 * refuses to touch because the snapshot cannot tell it.
 */
import { describe, it, expect } from "vitest";
import { planRestoreState } from "./demo-snapshot.js";

const CREATED = "2026-09-04T09:00:00.000Z";
const OB_KEY = `RAY|${CREATED}`;

/** A live Prisma row set, shaped the way fetchCompanies() returns it. */
function live(overrides = {}) {
  const {
    taskStatuses = { 1: "Blocked", 2: "Not started" },
    extraTasks = [],
    comments = [],
    drafts = [],
    obStatus = "Active",
  } = overrides;
  const phase = { id: 10, name: "Kickoff", sortOrder: 0, isComplete: false, targetDate: null };
  const tasks = [1, 2].map((n) => ({
    id: 100 + n,
    number: n,
    title: `Task ${n}`,
    status: taskStatuses[n],
    due: "2026-09-20",
    priority: "high",
    description: "",
    notes: "",
    sortOrder: n,
    owner: "",
    ownerId: null,
    ownerUser: null,
    assigneeContactId: null,
    assigneeContact: null,
    members: [],
    previousStatus: null,
    blockedByTaskId: null,
    blockedByTask: null,
    phase: { name: "Kickoff" },
    comments: comments.filter((c) => c.taskNumber === n),
  }));
  return [{
    prefix: "RAY",
    onboardings: [{
      id: 63,
      createdAt: new Date(CREATED),
      updatedAt: new Date("2026-09-11T09:00:00.000Z"),
      status: obStatus,
      owner: "Maya Lindqvist",
      ownerId: 8,
      ownerUser: { email: "demo@vector.test" },
      targetGoLive: new Date("2026-11-20T09:00:00.000Z"),
      phases: [phase],
      contacts: [{ id: 5, name: "Ada", email: "ada@raycast.com", role: "Head of Data", lastSeenPortalAt: null, bouncedAt: null }],
      magicLinks: [],
      files: [],
      activities: [],
      pendingChanges: drafts,
      tasks: [...tasks, ...extraTasks],
    }],
  }];
}

/** The matching snapshot: task 1 Blocked, task 2 Not started. */
function snapshot(extra = {}) {
  return {
    companies: [{
      prefix: "RAY",
      onboardings: [{
        key: OB_KEY,
        createdAt: CREATED,
        updatedAt: "2026-09-11T09:00:00.000Z",
        status: "Active",
        owner: "Maya Lindqvist",
        targetGoLive: "2026-11-20T09:00:00.000Z",
        phases: [{ name: "Kickoff", sortOrder: 0, isComplete: false, targetDate: null }],
        contacts: [{ name: "Ada", email: "ada@raycast.com", role: "Head of Data" }],
        tasks: [1, 2].map((n) => ({
          key: `RAY-${n}`,
          number: n,
          title: `Task ${n}`,
          status: n === 1 ? "Blocked" : "Not started",
          due: "2026-09-20",
          priority: "high",
          description: "",
          notes: "",
          sortOrder: n,
          owner: null,
          blockedByNumber: null,
        })),
        ...extra,
      }],
    }],
  };
}

const kinds = (plan) => plan.ops.map((o) => `${o.table}:${o.verb}`);

describe("restore-state diff", () => {
  it("does nothing when the board already matches", () => {
    const plan = planRestoreState(snapshot(), live());
    expect(plan.ops).toEqual([]);
  });

  it("puts a task a visitor ticked back to its seeded status", () => {
    const plan = planRestoreState(snapshot(), live({ taskStatuses: { 1: "Done", 2: "Not started" } }));
    expect(kinds(plan)).toEqual(["Task:reset"]);
    expect(plan.ops[0].label).toBe("RAY-1 status Done → Blocked");
  });

  it("deletes a task the snapshot has never heard of", () => {
    const extra = { ...live().at(0).onboardings[0].tasks[0], id: 999, number: 39, title: "Visitor task", comments: [] };
    const plan = planRestoreState(snapshot(), live({ extraTasks: [extra] }));
    expect(kinds(plan)).toEqual(["Task:delete"]);
    expect(plan.ops[0].label).toContain("RAY-39");
  });

  it("reports health as it will be after the restore, not as it is", () => {
    const plan = planRestoreState(snapshot(), live({ taskStatuses: { 1: "Done", 2: "Done" } }));
    expect(plan.health[0].now.status).toBe("On track");
    expect(plan.health[0].after.status).toBe("Blocked"); // 1 of 2 is over the 30% threshold
  });

  it("honours --only", () => {
    expect(planRestoreState(snapshot(), live(), { only: ["CHOW"] }).ops).toEqual([]);
    expect(planRestoreState(snapshot(), live({ taskStatuses: { 1: "Done", 2: "Not started" } }), { only: ["RAY"] }).ops)
      .toHaveLength(1);
  });

  it("refuses to guess at categories the snapshot does not carry", () => {
    // The old snapshot has no comments, so a visitor's comment is
    // indistinguishable from a seeded one and must survive.
    const plan = planRestoreState(snapshot(), live({
      comments: [{ id: 1, taskNumber: 1, author: "Visitor", body: "hi", createdAt: new Date("2026-09-12T10:00:00.000Z") }],
    }));
    expect(kinds(plan)).toEqual([]);
    expect(plan.inert).toContain("comments");
    expect(plan.inert).toContain("drafts");
  });

  it("sweeps a visitor comment once the snapshot carries comments", () => {
    const seeded = { key: "RAY-1|2026-09-01T10:00:00.000Z|Ada", taskNumber: 1, author: "Ada", body: "seeded", createdAt: "2026-09-01T10:00:00.000Z" };
    const plan = planRestoreState(snapshot({ comments: [seeded] }), live({
      comments: [
        { id: 1, taskNumber: 1, author: "Ada", body: "seeded", createdAt: new Date("2026-09-01T10:00:00.000Z") },
        { id: 2, taskNumber: 1, author: "Visitor", body: "hi", createdAt: new Date("2026-09-12T10:00:00.000Z") },
      ],
    }));
    expect(kinds(plan)).toEqual(["Comment:delete"]);
    expect(plan.ops[0].label).toContain("Visitor");
    expect(plan.inert).not.toContain("comments");
  });

  it("puts a draft a visitor approved back to pending", () => {
    const draft = {
      id: 7, action: "create_task", status: "applied", confidence: "high",
      sourceEvent: { sourceId: "EV-1" }, sourceQuote: "Erin to provision the account",
      createdAt: new Date("2026-09-05T12:00:00.000Z"), resolvedAt: new Date("2026-09-12T09:00:00.000Z"),
      resolvedBy: 8, rejectedReason: null, appliedTaskId: 999,
    };
    const snap = snapshot({
      drafts: [{
        key: "create_task|2026-09-05T12:00:00.000Z|Erin to provision the account",
        action: "create_task", status: "pending", confidence: "high",
        sourceEventSourceId: "EV-1", sourceQuote: "Erin to provision the account",
        createdAt: "2026-09-05T12:00:00.000Z", resolvedAt: null, rejectedReason: null, appliedTaskNumber: null,
      }],
    });
    const plan = planRestoreState(snap, live({ drafts: [draft] }));
    expect(kinds(plan)).toEqual(["PendingAIChange:reset"]);
    expect(plan.ops[0].label).toBe("draft create_task applied → pending");
  });

  it("deletes a draft created after the baseline", () => {
    const draft = {
      id: 8, action: "draft_followup", status: "pending", confidence: "low",
      sourceEvent: null, sourceQuote: "later", createdAt: new Date("2026-09-14T12:00:00.000Z"),
      resolvedAt: null, resolvedBy: null, rejectedReason: null, appliedTaskId: null,
    };
    const plan = planRestoreState(snapshot({ drafts: [] }), live({ drafts: [draft] }));
    expect(kinds(plan)).toEqual(["PendingAIChange:delete"]);
  });

  it("says so rather than acting when the onboarding is gone", () => {
    const plan = planRestoreState(snapshot(), [{ prefix: "RAY", onboardings: [] }]);
    expect(plan.ops).toEqual([]);
    expect(plan.skipped[0]).toMatch(/missing/);
  });
});
