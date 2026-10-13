import { describe, it, expect, beforeEach, vi } from "vitest";

// lib/db.ts's draft-link transactions (GAPS-PLAN feature 3), run against a
// small in-memory stand-in for the Prisma client: tables are arrays, `where`
// supports the handful of operators these functions use, and $transaction
// restores a snapshot when its callback throws (so rollback is real here).
// The route's createTask / updateTask are played by the `work` callbacks
// below, which add the task and its dependency rows the way insertDependencies
// does (feature 2 has its own tests). No database is touched.

type Row = Record<string, unknown> & { id: number };
const { store, prismaMock } = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unit-test@localhost/none";
  const store = { pendingAIChange: [] as Row[], task: [] as Row[], taskDependency: [] as Row[], seq: 1000 };
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  function matches(row: Row, where: Record<string, unknown> = {}): boolean {
    for (const [k, v] of Object.entries(where)) {
      const val = row[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if ("in" in o && !(o.in as unknown[]).includes(val)) return false;
        if ("not" in o && (o.not === null ? val == null : val === o.not)) return false;
        if ("equals" in o) {
          const eq = o.mode === "insensitive"
            ? String(val ?? "").toLowerCase() === String(o.equals).toLowerCase()
            : val === o.equals;
          if (!eq) return false;
        }
      } else if (val !== v) return false;
    }
    return true;
  }
  const table = (name: "pendingAIChange" | "task" | "taskDependency") => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => clone(store[name].find((r) => matches(r, where)) ?? null),
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      clone([...store[name]].sort((a, b) => a.id - b.id).find((r) => matches(r, where)) ?? null),
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      clone([...store[name]].sort((a, b) => a.id - b.id).filter((r) => matches(r, where))),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      // Column defaults the schema would fill in.
      const defaults = name === "pendingAIChange" ? { status: "pending", appliedTaskId: null } : {};
      const row = { id: ++store.seq, ...defaults, ...clone(data) } as Row;
      store[name].push(row);
      return clone(row);
    },
    update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = store[name].find((r) => matches(r, where));
      if (!row) throw new Error(`${name} ${JSON.stringify(where)} not found`);
      Object.assign(row, clone(data));
      return clone(row);
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = store[name].filter((r) => matches(r, where));
      for (const r of rows) Object.assign(r, clone(data));
      return { count: rows.length };
    },
    delete: async ({ where }: { where: Record<string, unknown> }) => {
      const i = store[name].findIndex((r) => matches(r, where));
      const [row] = store[name].splice(i, 1);
      return row;
    },
  });
  const prismaMock: Record<string, unknown> = {
    pendingAIChange: table("pendingAIChange"),
    task: table("task"),
    taskDependency: table("taskDependency"),
    $queryRaw: async () => [{ ok: 1 }],
  };
  prismaMock.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const snap = clone({ p: store.pendingAIChange, t: store.task, d: store.taskDependency });
    try {
      return await fn(prismaMock);
    } catch (err) {
      store.pendingAIChange = snap.p;
      store.task = snap.t;
      store.taskDependency = snap.d;
      throw err;
    }
  };
  return { store, prismaMock };
});

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn(function () {}) }));
vi.mock("./generated/prisma/client", () => ({
  PrismaClient: vi.fn(function () { return prismaMock; }),
  Prisma: { DbNull: {} },
}));
vi.mock("./email.js", () => ({ sendTaskAssigned: vi.fn(), sendTaskCommented: vi.fn() }));

import { applyDraftApproval, rejectDraftWithLinks, createMeetingDrafts, DraftConflictError } from "./db";
import { draftDependsOn, isDraftLink, type DependsOnItem, type DraftLinkItem } from "./task-dependencies";
import { readDraftLinks } from "./draft-links";

const EVENT = 500;
const OB = 63;
const EXISTING = 7; // an open task already on the board

/** The meeting: A = "Add the metrics block"; B waits on A; C = update of task 7 that waits on A. */
async function seedMeeting() {
  store.pendingAIChange = [];
  store.task = [{ id: EXISTING, title: "Dashboards parity", status: "In progress", onboardingId: OB, blockedByTaskId: null }];
  store.taskDependency = [];
  store.seq = 1000;
  const rows = await createMeetingDrafts([
    { source: "miniti", sourceEventId: EVENT, onboardingId: OB, action: "create_task", payload: { draftRef: "d1", title: "Add the metrics block", phaseId: 1 } },
    {
      source: "miniti", sourceEventId: EVENT, onboardingId: OB, action: "create_task",
      payload: { draftRef: "d2", title: "Migrate the dashboards", phaseId: 1, dependsOn: [{ draftRef: "d1", title: "Add the metrics block" }, { text: "platform sign-off" }] },
    },
    {
      source: "miniti", sourceEventId: EVENT, onboardingId: OB, action: "match_existing",
      payload: { taskId: EXISTING, action: "add_dependency", changes: { dependsOn: [{ draftRef: "d1", title: "Add the metrics block" }] } },
    },
  ]);
  return { A: rows[0].id, B: rows[1].id, C: rows[2].id };
}

/** What insertDependencies does for these rows: skip duplicates, task or text. */
function addDeps(taskId: number, items: DependsOnItem[]) {
  for (const item of items) {
    if ("taskId" in item) {
      if (store.taskDependency.some((d) => d.taskId === taskId && d.blockedByTaskId === item.taskId)) continue;
      store.taskDependency.push({ id: ++store.seq, taskId, blockedByTaskId: item.taskId, label: null, resolvedAt: null });
    } else {
      if (store.taskDependency.some((d) => d.taskId === taskId && String(d.label).toLowerCase() === item.text.toLowerCase())) continue;
      store.taskDependency.push({ id: ++store.seq, taskId, blockedByTaskId: null, label: item.text, resolvedAt: null });
    }
  }
}

function draftRow(id: number) {
  return store.pendingAIChange.find((d) => d.id === id)!;
}

/** Approve a draft the way the route does: plain deps + link deps, via applyDraftApproval. */
async function approve(id: number) {
  const draft = draftRow(id);
  const payload = draft.payload as Record<string, unknown>;
  const isCreate = draft.action === "create_task";
  const deps = isCreate ? draftDependsOn(payload) : draftDependsOn((payload.changes ?? {}) as Record<string, unknown>);
  const plain = deps.filter((d): d is DependsOnItem => !isDraftLink(d));
  const links = deps.filter(isDraftLink) as DraftLinkItem[];
  return applyDraftApproval({
    draftId: id,
    resolvedBy: 8,
    links,
    work: async ({ linkDeps }) => {
      const taskId = isCreate ? ++store.seq : EXISTING;
      if (isCreate) store.task.push({ id: taskId, title: payload.title, status: "Not started", onboardingId: OB, blockedByTaskId: null });
      addDeps(taskId, [...plain, ...linkDeps]);
      return { appliedTaskId: taskId, value: taskId };
    },
  });
}

/** The board's dependencies as readable pairs, order-free: "Migrate the dashboards → task:Add the metrics block". */
function boardLinks() {
  const title = (id: unknown) => store.task.find((t) => t.id === id)?.title;
  return store.taskDependency
    .map((d) => `${title(d.taskId)} → ${d.blockedByTaskId != null ? `task:${title(d.blockedByTaskId)}` : `text:${d.label}`}`)
    .sort();
}

const LINKED_END_STATE = [
  "Dashboards parity → task:Add the metrics block",
  "Migrate the dashboards → task:Add the metrics block",
  "Migrate the dashboards → text:platform sign-off",
];

describe("createMeetingDrafts", () => {
  it("binds { draftRef } links to the sibling's row id, on creates and on updates", async () => {
    const { A, B, C } = await seedMeeting();
    expect((draftRow(B).payload as { dependsOn: unknown }).dependsOn).toEqual([
      { draftId: A, draftRef: "d1", title: "Add the metrics block" },
      { text: "platform sign-off" },
    ]);
    expect((draftRow(C).payload as { changes: { dependsOn: unknown } }).changes.dependsOn).toEqual([
      { draftId: A, draftRef: "d1", title: "Add the metrics block" },
    ]);
  });
});

describe("applyDraftApproval: order does not matter", () => {
  beforeEach(async () => { await seedMeeting(); });

  it("in order: the blocker first, then the dependents link straight to its task", async () => {
    const { A, B, C } = { A: 1001, B: 1002, C: 1003 };
    await approve(A);
    const b = await approve(B);
    await approve(C);
    expect(boardLinks()).toEqual(LINKED_END_STATE);
    expect(b.draftLinks).toEqual([expect.objectContaining({ draftId: A, state: "linked" })]);
  });

  it("out of order: dependents first hold a text placeholder, the blocker's approval links them (once)", async () => {
    const [A, B, C] = [1001, 1002, 1003];
    const b = await approve(B);
    expect(b.draftLinks).toEqual([expect.objectContaining({ draftId: A, state: "pending", dependencyId: expect.any(Number) })]);
    // Meanwhile the board says what it waits on, as text.
    expect(boardLinks()).toContain("Migrate the dashboards → text:Add the metrics block");
    await approve(C);
    const a = await approve(A);
    expect(a.resolved.map((r) => [r.draftId, r.state])).toEqual([[B, "linked"], [C, "linked"]]);
    expect(boardLinks()).toEqual(LINKED_END_STATE);
    expect(readDraftLinks(draftRow(B).payload)[0]).toMatchObject({ state: "linked", blockedByTaskId: draftRow(A).appliedTaskId });
    // The legacy column follows the first task blocker.
    const bTask = store.task.find((t) => t.id === draftRow(B).appliedTaskId)!;
    expect(bTask.blockedByTaskId).toBe(draftRow(A).appliedTaskId);
  });

  it("a bulk action in any order ends with the same links as approving in order", async () => {
    for (const order of [[1002, 1003, 1001], [1003, 1001, 1002], [1001, 1003, 1002]]) {
      await seedMeeting();
      for (const id of order) await approve(id);
      expect(boardLinks()).toEqual(LINKED_END_STATE);
    }
  });

  it("completing a link is idempotent: a later approval leaves a linked row alone", async () => {
    await approve(1002);
    await approve(1001);
    const before = JSON.stringify(store.taskDependency);
    await approve(1003); // another sibling approved afterwards
    expect(store.taskDependency.filter((d) => d.taskId === draftRow(1002).appliedTaskId)).toHaveLength(2);
    expect(JSON.stringify(store.taskDependency.filter((d) => d.taskId !== EXISTING))).toBe(
      JSON.stringify(JSON.parse(before).filter((d: Row) => d.taskId !== EXISTING))
    );
  });

  it("refuses a draft that is no longer pending, and rolls everything back", async () => {
    await approve(1001);
    const snapshot = JSON.stringify(store);
    await expect(approve(1001)).rejects.toBeInstanceOf(DraftConflictError);
    expect(JSON.stringify(store)).toBe(snapshot);
  });
});

describe("rejected blocker", () => {
  beforeEach(async () => { await seedMeeting(); });

  it("rejected before the dependent is approved: the dependent gets a text blocker with its title", async () => {
    const r = await rejectDraftWithLinks(1001, { resolvedBy: 8, reason: "not needed" });
    expect(r.dependents.map((d) => d.draftId)).toEqual([1002, 1003]);
    const b = await approve(1002);
    expect(b.draftLinks).toEqual([expect.objectContaining({ state: "kept_as_text", reason: "rejected" })]);
    expect(boardLinks()).toContain("Migrate the dashboards → text:Add the metrics block");
  });

  it("rejected after the dependent was approved: the placeholder stays as text and the link says so", async () => {
    await approve(1002);
    const r = await rejectDraftWithLinks(1001, { resolvedBy: 8 });
    expect(r.dependents).toEqual([{ draftId: 1002, title: "Migrate the dashboards", status: "applied" }, { draftId: 1003, title: "An update to a task", status: "pending" }]);
    expect(readDraftLinks(draftRow(1002).payload)[0]).toMatchObject({ state: "kept_as_text", reason: "rejected" });
    expect(boardLinks()).toEqual(["Migrate the dashboards → text:Add the metrics block", "Migrate the dashboards → text:platform sign-off"]);
  });
});

describe("placeholders a person changed meanwhile", () => {
  beforeEach(async () => { await seedMeeting(); });

  it("a placeholder deleted by hand stays deleted", async () => {
    const b = await approve(1002);
    store.taskDependency = store.taskDependency.filter((d) => d.id !== b.draftLinks[0].dependencyId);
    const a = await approve(1001);
    expect(a.resolved[0]).toMatchObject({ draftId: 1002, state: "removed" });
    expect(boardLinks()).toEqual(["Migrate the dashboards → text:platform sign-off"]);
  });

  it("a placeholder ticked off by hand is left as text", async () => {
    const b = await approve(1002);
    store.taskDependency.find((d) => d.id === b.draftLinks[0].dependencyId)!.resolvedAt = "2026-10-13T10:00:00Z";
    const a = await approve(1001);
    expect(a.resolved[0]).toMatchObject({ state: "kept_as_text" });
  });

  it("a link that would make a loop is kept as text instead of failing the blocker's approval", async () => {
    // Task 7 waits on A (draft C, approved first, so a placeholder); then A is
    // edited to wait on task 7. Linking the placeholder would close a loop.
    await approve(1003); // task 7 → placeholder for A
    const p = draftRow(1001).payload as Record<string, unknown>;
    p.dependsOn = [{ taskId: EXISTING }]; // A now waits on task 7
    const a = await approve(1001);
    expect(a.resolved[0]).toMatchObject({ draftId: 1003, state: "kept_as_text", reason: "would make a loop" });
  });
});
