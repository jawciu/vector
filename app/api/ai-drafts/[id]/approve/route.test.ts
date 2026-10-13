import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The route handler is tested as a plain function: build a Request, call
// POST(), assert on the Response and on what it passed to createTask.
// Same mocking shape as the miniti webhook route test.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "caro@vector.test" } } }) },
  })),
}));

vi.mock("@/lib/db", () => ({
  getPendingAIChange: vi.fn(),
  markAIChangeApplied: vi.fn(async () => {}),
  markAIChangeRejected: vi.fn(async () => {}),
  getTaskOnboardingId: vi.fn(),
  getTaskNotes: vi.fn(),
  getContactsForOnboarding: vi.fn(async () => []),
  getVendorUserById: vi.fn(),
  getPhasesForOnboarding: vi.fn(async () => []),
  createTask: vi.fn(async () => ({ id: 999 })),
  updateTask: vi.fn(),
  createComment: vi.fn(),
  getOrCreateVendorUser: vi.fn(async () => ({ id: 1, name: "Caroline Jaworsky" })),
  addTaskDependencies: vi.fn(async () => ({})),
  classifyBlockerTasks: vi.fn(async (_ob: number, ids: number[]) => ({ open: ids, closed: [], missing: [], foreign: [] })),
}));

import {
  getPendingAIChange,
  getVendorUserById,
  getPhasesForOnboarding,
  createTask,
  markAIChangeApplied,
  markAIChangeRejected,
  getTaskOnboardingId,
  getTaskNotes,
  getContactsForOnboarding,
  updateTask,
  createComment,
  addTaskDependencies,
  classifyBlockerTasks,
} from "@/lib/db";
import { POST } from "./route";

// Fixtures stub only the fields the route reads, so mock handles are partial.
const partialMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  vi.mocked(fn, { partial: true, deep: true });


function req(body: unknown = {}) {
  return new Request("http://localhost/api/ai-drafts/232/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "232" });

function draftWithOwner(ownerId: number | null | undefined) {
  return {
    id: 232,
    action: "create_task",
    status: "pending",
    onboardingId: 63,
    payload: { title: "Escalate to Priya", phaseId: 338, ownerId, dueDate: "2026-09-20" },
  };
}

describe("POST /api/ai-drafts/[id]/approve — create_task ownerId resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    partialMock(createTask).mockResolvedValue({
      id: 999,
      taskId: "RAY-40",
      number: 40,
      title: "Escalate to Priya",
      phaseId: 338,
    });
    partialMock(getPhasesForOnboarding).mockResolvedValue([
      { id: 337, name: "Security, Governance & Access" },
      { id: 338, name: "Training, Rollout & Go-live" },
    ]);
  });

  it("refuses a dangling payload.ownerId with a 409 naming the person, instead of dropping it", async () => {
    // VendorUser 4 was deleted when Maya was merged into 8, but create_task
    // draft payloads still carry ownerId 4. Task.ownerId is a real FK, so
    // passing it through threw P2003 (500). Then it was silently dropped. Now
    // the reviewer has to choose: a new owner, or explicitly unassigned.
    partialMock(getPendingAIChange).mockResolvedValue({
      ...draftWithOwner(4),
      payload: { ...draftWithOwner(4).payload, ownerName: "Theo Okonkwo" },
    });
    partialMock(getVendorUserById).mockResolvedValue(null);

    const res = await POST(req(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Theo Okonkwo is no longer in the workspace: pick a new owner or leave unassigned"
    );
    expect(getVendorUserById).toHaveBeenCalledWith(4);
    expect(createTask).not.toHaveBeenCalled();
    expect(markAIChangeApplied).not.toHaveBeenCalled();
  });

  it("applies an explicit 'leave unassigned' choice (ownerId: null override)", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(draftWithOwner(4));
    partialMock(getVendorUserById).mockResolvedValue(null);

    const res = await POST(req({ overrides: { ownerId: null } }), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({ onboardingId: 63, phaseId: 338, ownerId: null });
    expect(markAIChangeApplied).toHaveBeenCalledWith(232, { resolvedBy: 1, appliedTaskId: 999 });
  });

  it("refuses a customer assignee who is no longer on the onboarding", async () => {
    partialMock(getPendingAIChange).mockResolvedValue({
      ...draftWithOwner(undefined),
      payload: { ...draftWithOwner(undefined).payload, assigneeContactId: 31, assigneeContactName: "Pat Lee" },
    });
    partialMock(getContactsForOnboarding).mockResolvedValue([{ id: 21, name: "Someone else" }]);

    const res = await POST(req(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Pat Lee is no longer on this onboarding: pick a new assignee or leave unassigned");
    expect(createTask).not.toHaveBeenCalled();
  });

  it("keeps an ownerId that still resolves to a live VendorUser", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(draftWithOwner(6));
    partialMock(getVendorUserById).mockResolvedValue({ id: 6, name: "Ines Ferreira" });

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({ ownerId: 6 });
  });

  it("does not look up an owner when the draft has none", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(draftWithOwner(undefined));

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(getVendorUserById).not.toHaveBeenCalled();
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({ ownerId: null });
  });

  it("validates an overridden owner too", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(draftWithOwner(6));
    partialMock(getVendorUserById).mockResolvedValue(null);

    const res = await POST(req({ overrides: { ownerId: 4 } }), { params });

    // The override is not the proposed owner, so there is no name to give.
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/^The proposed owner is no longer in the workspace/);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("returns the created task and its phase name so the inbox can toast and link", async () => {
    // The approved row just vanished before this: nothing told the user which
    // column the task landed in, and the board never learned about it.
    partialMock(getPendingAIChange).mockResolvedValue(draftWithOwner(6));
    partialMock(getVendorUserById).mockResolvedValue({ id: 6, name: "Ines Ferreira" });

    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created.phaseName).toBe("Training, Rollout & Go-live");
    expect(body.created.onboardingId).toBe(63);
    // Same shape POST /api/tasks returns, so the board's onTaskCreated can
    // consume it directly rather than refetching.
    expect(body.created.task).toMatchObject({
      id: 999,
      taskId: "RAY-40",
      phaseId: 338,
    });
  });

  it("leaves phaseName null when the phase cannot be resolved", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(draftWithOwner(6));
    partialMock(getVendorUserById).mockResolvedValue({ id: 6, name: "Ines Ferreira" });
    partialMock(getPhasesForOnboarding).mockResolvedValue([]);

    const body = await (await POST(req(), { params })).json();

    expect(body.created.phaseName).toBeNull();
    expect(body.created.task.id).toBe(999);
  });
});

describe("POST /api/ai-drafts/[id]/approve — match_existing updates", () => {
  function updateDraft(payload: Record<string, unknown>) {
    return { id: 232, action: "match_existing", status: "pending", onboardingId: 63, payload: { taskId: 501, ...payload } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T10:00:00Z"));
    partialMock(getTaskOnboardingId).mockResolvedValue(63);
    partialMock(getTaskNotes).mockResolvedValue("Written by a person.");
    partialMock(getVendorUserById).mockResolvedValue({ id: 6, name: "Ines Ferreira" });
    partialMock(getContactsForOnboarding).mockResolvedValue([{ id: 21, name: "Customer Contact" }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies every change in ONE updateTask call, appending notes with a dated line", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(
      updateDraft({
        action: "update",
        changes: { ownerId: 6, assigneeContactId: 21, priority: "high", dueDate: "2026-06-26", appendNotes: "Audience: finance leads." },
      })
    );

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateTask).mock.calls[0][0]).toBe(501);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({
      ownerId: 6,
      assigneeContactId: 21,
      priority: "high",
      due: "2026-06-26",
      notes: "Written by a person.\n[2026-06-19] Audience: finance leads.",
    });
    expect(createComment).not.toHaveBeenCalled();
    expect(markAIChangeApplied).toHaveBeenCalledWith(232, { resolvedBy: 1, appliedTaskId: 501 });
  });

  it("still approves a legacy single-action draft (update_due_date)", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ action: "update_due_date", newDueDate: "2026-06-30" }));

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({ due: "2026-06-30" });
  });

  it("still approves a legacy reprioritise draft", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ action: "reprioritise", newPriority: "low" }));

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({ priority: "low" });
  });

  it("legacy reassign: an un-edited approve only records the audit comment", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ action: "reassign", sourceQuote: "Can you take this one?" }));

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(updateTask).not.toHaveBeenCalled();
    expect(vi.mocked(createComment).mock.calls[0][2]).toBe("Vector flagged a reassignment: Can you take this one?");
  });

  it("legacy reassign with the old editor's overrides applies the owner and keeps the comment", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ action: "reassign", sourceQuote: "q" }));

    const res = await POST(req({ overrides: { newOwnerId: 6, newAssigneeContactId: null } }), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({ ownerId: 6, assigneeContactId: null });
    expect(createComment).toHaveBeenCalledTimes(1);
  });

  it("an edited `changes` override replaces the stored changes", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(
      updateDraft({ action: "update", changes: { dueDate: "2026-06-26", appendNotes: "drop me" } })
    );

    const res = await POST(req({ overrides: { changes: { dueDate: "2026-07-01", priority: "medium" } } }), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({ due: "2026-07-01", priority: "medium" });
    expect(getTaskNotes).not.toHaveBeenCalled();
  });

  it("taskId in overrides is ignored (security boundary)", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { priority: "high" } }));

    await POST(req({ overrides: { taskId: 777, changes: { priority: "high" } } }), { params });

    expect(getTaskOnboardingId).toHaveBeenCalledWith(501);
    expect(vi.mocked(updateTask).mock.calls[0][0]).toBe(501);
  });

  it("rejects an invalid edited value with 400 and leaves the draft pending", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { priority: "high" } }));

    for (const bad of [{ dueDate: "next week" }, { priority: "urgent" }, { ownerId: "x" }, { colour: "red" }]) {
      const res = await POST(req({ overrides: { changes: bad } }), { params });
      expect(res.status).toBe(400);
    }
    expect(updateTask).not.toHaveBeenCalled();
    expect(markAIChangeApplied).not.toHaveBeenCalled();
  });

  it("a gone owner or assignee is a 409 with a named message, never a silent drop", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { ownerId: 4 }, ownerName: "Sam Doe" }));
    partialMock(getVendorUserById).mockResolvedValue(null);
    let res = await POST(req(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Sam Doe is no longer in the workspace: pick a new owner or leave unassigned");

    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { assigneeContactId: 99 } }));
    res = await POST(req(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/^The proposed assignee is no longer on this onboarding/);

    expect(updateTask).not.toHaveBeenCalled();
  });

  it("an explicit 'leave unassigned' choice on an update applies exactly that", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(
      updateDraft({ action: "update", changes: { ownerId: 4, priority: "high" }, ownerName: "Sam Doe" })
    );
    partialMock(getVendorUserById).mockResolvedValue(null);

    const res = await POST(req({ overrides: { changes: { ownerId: null, priority: "high" } } }), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({ ownerId: null, priority: "high" });
  });

  it("dueDate: null removes the due date; absent leaves it", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { dueDate: null } }));
    expect((await POST(req(), { params })).status).toBe(200);
    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({ due: "" });

    vi.mocked(updateTask).mockClear();
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { priority: "low" } }));
    await POST(req(), { params });
    expect(vi.mocked(updateTask).mock.calls[0][1]).not.toHaveProperty("due");
  });

  it("stamps the appended note with the meeting's day and source when the draft has one", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(
      updateDraft({
        changes: { appendNotes: "Read-only access." },
        noteSource: { date: "2026-06-16", label: "call with Acme" },
      })
    );

    await POST(req(), { params });

    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({
      notes: "Written by a person.\n[2026-06-16, call with Acme] Read-only access.",
    });
  });

  it("falls back to today's date in London when the draft has no meeting", async () => {
    // 23:30 UTC on 30 Jun is already 1 Jul in London.
    vi.setSystemTime(new Date("2026-06-30T23:30:00Z"));
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { appendNotes: "Read-only access." } }));

    await POST(req(), { params });

    expect(vi.mocked(updateTask).mock.calls[0][1]).toEqual({
      notes: "Written by a person.\n[2026-07-01] Read-only access.",
    });
  });

  it("an update with nothing to change is a 400, not a silent apply", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ action: "update_due_date" }));

    const res = await POST(req(), { params });

    expect(res.status).toBe(400);
    expect(markAIChangeApplied).not.toHaveBeenCalled();
  });

  it("still auto-rejects when the target task is gone", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { priority: "high" } }));
    partialMock(getTaskOnboardingId).mockResolvedValue(null);

    const res = await POST(req(), { params });

    expect(res.status).toBe(410);
    expect(markAIChangeRejected).toHaveBeenCalledWith(232, { resolvedBy: 1, reason: "task no longer exists" });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("refuses a target task from another onboarding", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ changes: { priority: "high" } }));
    partialMock(getTaskOnboardingId).mockResolvedValue(64);

    expect((await POST(req(), { params })).status).toBe(400);
    expect(updateTask).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-drafts/[id]/approve — dependencies (GAPS-PLAN feature 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    partialMock(createTask).mockResolvedValue({ id: 999, title: "Rebuild the report", phaseId: 338 });
    partialMock(getTaskOnboardingId).mockResolvedValue(63);
    partialMock(getTaskNotes).mockResolvedValue("");
    vi.mocked(classifyBlockerTasks).mockImplementation(async (_ob, ids) => ({ open: ids, closed: [], missing: [], foreign: [] }));
  });

  function createDraft(payload: Record<string, unknown>) {
    return { id: 232, action: "create_task", status: "pending", onboardingId: 63, payload: { title: "Rebuild the report", phaseId: 338, ...payload } };
  }
  type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
  function updateDraft(changes: { [k: string]: Json }) {
    return { id: 232, action: "match_existing", status: "pending", onboardingId: 63, payload: { taskId: 501, action: "add_dependency", changes } };
  }

  it("create_task passes task and text blockers to createTask as dependsOn", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(
      createDraft({ dependsOn: [{ taskId: 7 }, { text: "platform team sign-off" }] })
    );
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(createTask).mock.calls[0][0].dependsOn).toEqual([{ taskId: 7 }, { text: "platform team sign-off" }]);
    expect(vi.mocked(createTask).mock.calls[0][0]).not.toHaveProperty("blockedByTaskId");
  });

  it("an older draft's blockedByTaskId is folded into dependsOn", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(createDraft({ blockedByTaskId: 7 }));
    await POST(req(), { params });
    expect(vi.mocked(createTask).mock.calls[0][0].dependsOn).toEqual([{ taskId: 7 }]);
  });

  it("the editor's dependsOn override replaces the stored list", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(createDraft({ dependsOn: [{ taskId: 7 }, { text: "x sign-off" }] }));
    await POST(req({ overrides: { dependsOn: [{ text: "x sign-off" }] } }), { params });
    expect(vi.mocked(createTask).mock.calls[0][0].dependsOn).toEqual([{ text: "x sign-off" }]);
  });

  it("a blocker task from another onboarding is a 400 and nothing is created", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(createDraft({ dependsOn: [{ taskId: 7 }] }));
    vi.mocked(classifyBlockerTasks).mockResolvedValue({ open: [], closed: [], missing: [], foreign: [7] });
    const res = await POST(req(), { params });
    expect(res.status).toBe(400);
    expect(createTask).not.toHaveBeenCalled();
    expect(markAIChangeApplied).not.toHaveBeenCalled();
  });

  it("a blocker that is done or deleted since drafting is skipped and reported", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(
      createDraft({ dependsOn: [{ taskId: 7 }, { taskId: 8 }, { taskId: 9 }, { text: "legal ok" }] })
    );
    vi.mocked(classifyBlockerTasks).mockResolvedValue({ open: [9], closed: [7], missing: [8], foreign: [] });
    const res = await POST(req(), { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(vi.mocked(createTask).mock.calls[0][0].dependsOn).toEqual([{ taskId: 9 }, { text: "legal ok" }]);
    expect(body.skippedDependencies.sort()).toEqual([7, 8]);
  });

  it("match_existing adds the dependencies to the target task", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ dependsOn: [{ taskId: 7 }, { text: "security review closes" }] }));
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect(updateTask).not.toHaveBeenCalled();
    expect(addTaskDependencies).toHaveBeenCalledWith(501, [{ taskId: 7 }, { text: "security review closes" }]);
    expect(markAIChangeApplied).toHaveBeenCalledWith(232, { resolvedBy: 1, appliedTaskId: 501 });
  });

  it("match_existing with notes and a dependency applies both", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ appendNotes: "Scope agreed.", dependsOn: [{ text: "budget approval" }] }));
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(addTaskDependencies).toHaveBeenCalledWith(501, [{ text: "budget approval" }]);
  });

  it("match_existing refuses a foreign blocker before writing anything", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ appendNotes: "x", dependsOn: [{ taskId: 7 }] }));
    vi.mocked(classifyBlockerTasks).mockResolvedValue({ open: [], closed: [], missing: [], foreign: [7] });
    const res = await POST(req(), { params });
    expect(res.status).toBe(400);
    expect(updateTask).not.toHaveBeenCalled();
    expect(addTaskDependencies).not.toHaveBeenCalled();
  });

  it("match_existing refuses the task depending on itself", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ dependsOn: [{ taskId: 501 }] }));
    const res = await POST(req(), { params });
    expect(res.status).toBe(400);
    expect(addTaskDependencies).not.toHaveBeenCalled();
  });

  it("match_existing whose only blockers are done is a 400 that says why", async () => {
    partialMock(getPendingAIChange).mockResolvedValue(updateDraft({ dependsOn: [{ taskId: 7 }] }));
    vi.mocked(classifyBlockerTasks).mockResolvedValue({ open: [], closed: [7], missing: [], foreign: [] });
    const res = await POST(req(), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/done or gone/);
    expect(markAIChangeApplied).not.toHaveBeenCalled();
  });
});
