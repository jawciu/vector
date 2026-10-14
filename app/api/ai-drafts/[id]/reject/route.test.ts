import { describe, it, expect, beforeEach, vi } from "vitest";

// Reject route as a plain function (same mocking shape as the approve route test).
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "caro@vector.test" } } }) },
  })),
}));
vi.mock("@/lib/db", () => ({
  getPendingAIChange: vi.fn(),
  rejectDraftWithLinks: vi.fn(async () => ({ dependents: [] })),
  getOrCreateVendorUser: vi.fn(async () => ({ id: 1, name: "Caroline Jaworsky" })),
  DraftConflictError: class DraftConflictError extends Error {
    status = 409;
  },
}));

import { getPendingAIChange, rejectDraftWithLinks, DraftConflictError } from "@/lib/db";
import { POST } from "./route";

const partialMock = <T extends (...args: never[]) => unknown>(fn: T) => vi.mocked(fn, { partial: true, deep: true });
const params = Promise.resolve({ id: "230" });
const req = (body: unknown = {}) =>
  new Request("http://localhost/api/ai-drafts/230/reject", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/ai-drafts/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    partialMock(getPendingAIChange).mockResolvedValue({ id: 230, status: "pending", action: "create_task" });
  });

  it("rejects through rejectDraftWithLinks with the reason", async () => {
    const res = await POST(req({ reason: "not needed" }), { params });
    expect(res.status).toBe(200);
    expect(rejectDraftWithLinks).toHaveBeenCalledWith(230, { resolvedBy: 1, reason: "not needed" });
    expect(await res.json()).toEqual({ ok: true });
  });

  it("lists the drafts that waited on it (they keep it as a text blocker)", async () => {
    vi.mocked(rejectDraftWithLinks).mockResolvedValueOnce({
      dependents: [{ draftId: 231, title: "Migrate the dashboards", status: "pending" }],
    });
    const body = await (await POST(req(), { params })).json();
    expect(body.dependents).toEqual([{ draftId: 231, title: "Migrate the dashboards", status: "pending" }]);
  });

  it("a draft resolved meanwhile is a 409", async () => {
    vi.mocked(rejectDraftWithLinks).mockRejectedValueOnce(new DraftConflictError("Draft already applied"));
    const res = await POST(req(), { params });
    expect(res.status).toBe(409);
  });
});
