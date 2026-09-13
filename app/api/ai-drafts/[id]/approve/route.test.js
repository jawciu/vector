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
  createTask: vi.fn(async () => ({ id: 999 })),
  updateTask: vi.fn(),
  createComment: vi.fn(),
  getOrCreateVendorUser: vi.fn(async () => ({ id: 1, name: "Caroline Jaworsky" })),
}));

import {
  getPendingAIChange,
  getVendorUserById,
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
    createTask.mockResolvedValue({ id: 999 });
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
});
