import { describe, it, expect, beforeEach, vi } from "vitest";

// The route handler is tested as a plain function: build a Request, call
// POST(), assert on the Response and on what it passed to createTask.
// Same mocking shape as the miniti webhook route test.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) =>
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
  getVendorUserById: vi.fn(),
  getPhasesForOnboarding: vi.fn(async () => []),
  createTask: vi.fn(async () => ({ id: 999 })),
  updateTask: vi.fn(),
  createComment: vi.fn(),
  getOrCreateVendorUser: vi.fn(async () => ({ id: 1, name: "Caroline Jaworsky" })),
}));

import {
  getPendingAIChange,
  getVendorUserById,
  getPhasesForOnboarding,
  createTask,
  markAIChangeApplied,
} from "@/lib/db";
import { POST } from "./route.js";

function req(body = {}) {
  return new Request("http://localhost/api/ai-drafts/232/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "232" });

function draftWithOwner(ownerId) {
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
    createTask.mockResolvedValue({
      id: 999,
      taskId: "RAY-40",
      number: 40,
      title: "Escalate to Priya",
      phaseId: 338,
    });
    getPhasesForOnboarding.mockResolvedValue([
      { id: 337, name: "Security, Governance & Access" },
      { id: 338, name: "Training, Rollout & Go-live" },
    ]);
  });

  it("drops a dangling payload.ownerId instead of letting the FK insert fail", async () => {
    // VendorUser 4 was deleted when Maya was merged into 8, but create_task
    // draft payloads still carry ownerId 4. Task.ownerId is a real FK, so
    // passing it through threw P2003 and the approve returned 500.
    getPendingAIChange.mockResolvedValue(draftWithOwner(4));
    getVendorUserById.mockResolvedValue(null);

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(getVendorUserById).toHaveBeenCalledWith(4);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0][0]).toMatchObject({
      onboardingId: 63,
      phaseId: 338,
      ownerId: null,
    });
    expect(markAIChangeApplied).toHaveBeenCalledWith(232, {
      resolvedBy: 1,
      appliedTaskId: 999,
    });
  });

  it("keeps an ownerId that still resolves to a live VendorUser", async () => {
    getPendingAIChange.mockResolvedValue(draftWithOwner(6));
    getVendorUserById.mockResolvedValue({ id: 6, name: "Ines Ferreira" });

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(createTask.mock.calls[0][0]).toMatchObject({ ownerId: 6 });
  });

  it("does not look up an owner when the draft has none", async () => {
    getPendingAIChange.mockResolvedValue(draftWithOwner(undefined));

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(getVendorUserById).not.toHaveBeenCalled();
    expect(createTask.mock.calls[0][0]).toMatchObject({ ownerId: null });
  });

  it("lets an overridden owner be validated too", async () => {
    getPendingAIChange.mockResolvedValue(draftWithOwner(4));
    getVendorUserById.mockResolvedValue(null);

    const res = await POST(req({ overrides: { ownerId: 4 } }), { params });

    expect(res.status).toBe(200);
    expect(createTask.mock.calls[0][0]).toMatchObject({ ownerId: null });
  });

  it("returns the created task and its phase name so the inbox can toast and link", async () => {
    // The approved row just vanished before this: nothing told the user which
    // column the task landed in, and the board never learned about it.
    getPendingAIChange.mockResolvedValue(draftWithOwner(6));
    getVendorUserById.mockResolvedValue({ id: 6, name: "Ines Ferreira" });

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
    getPendingAIChange.mockResolvedValue(draftWithOwner(6));
    getVendorUserById.mockResolvedValue({ id: 6, name: "Ines Ferreira" });
    getPhasesForOnboarding.mockResolvedValue([]);

    const body = await (await POST(req(), { params })).json();

    expect(body.created.phaseName).toBeNull();
    expect(body.created.task.id).toBe(999);
  });
});
