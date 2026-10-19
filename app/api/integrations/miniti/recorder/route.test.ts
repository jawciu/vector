import { describe, it, expect, beforeEach, vi } from "vitest";

// The settings route as plain functions (same mocking shape as the draft routes' tests).
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }),
  },
}));
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/lib/db", () => ({
  getMinitiRecorder: vi.fn(),
  getOrCreateVendorUser: vi.fn(),
  getVendorUserById: vi.fn(),
  setMinitiRecorder: vi.fn(async () => undefined),
}));

import { getMinitiRecorder, getOrCreateVendorUser, getVendorUserById, setMinitiRecorder } from "@/lib/db";
import { GET, PUT } from "./route";

const partialMock = <T extends (...args: never[]) => unknown>(fn: T) => vi.mocked(fn, { partial: true, deep: true });
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/integrations/miniti/recorder", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const signedIn = () => getUser.mockResolvedValue({ data: { user: { id: "auth-1", email: "robin@vendor.test" } } });

describe("/api/integrations/miniti/recorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
    partialMock(getOrCreateVendorUser).mockResolvedValue({ id: 1, role: "member" });
    partialMock(getMinitiRecorder).mockResolvedValue({ id: 4, name: "Jules Park", email: "jules@vendor.test" });
    partialMock(getVendorUserById).mockResolvedValue({ id: 4, name: "Jules Park", email: "jules@vendor.test", role: "admin" });
  });

  it("GET returns the current recorder", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorder: { id: 4, name: "Jules Park", email: "jules@vendor.test" } });
  });

  it("GET and PUT need a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect((await put({ vendorUserId: 4 })).status).toBe(401);
    expect(setMinitiRecorder).not.toHaveBeenCalled();
  });

  it("PUT saves a team member who can own work and returns them", async () => {
    const res = await put({ vendorUserId: 4 });
    expect(res.status).toBe(200);
    expect(setMinitiRecorder).toHaveBeenCalledWith(4);
    expect((await res.json()).recorder).toMatchObject({ id: 4 });
  });

  it("PUT null clears it", async () => {
    partialMock(getMinitiRecorder).mockResolvedValue(null);
    const res = await put({ vendorUserId: null });
    expect(res.status).toBe(200);
    expect(setMinitiRecorder).toHaveBeenCalledWith(null);
    expect(getVendorUserById).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ recorder: null });
  });

  it("PUT rejects bad bodies without saving", async () => {
    for (const body of ["not json", {}, { vendorUserId: "4" }, { vendorUserId: 0 }, { vendorUserId: 1.5 }, { vendorUserId: -2 }]) {
      expect((await put(body)).status).toBe(400);
    }
    expect(setMinitiRecorder).not.toHaveBeenCalled();
  });

  it("PUT 404s for someone who isn't on the team", async () => {
    partialMock(getVendorUserById).mockResolvedValue(null);
    expect((await put({ vendorUserId: 99 })).status).toBe(404);
    expect(setMinitiRecorder).not.toHaveBeenCalled();
  });

  it("PUT refuses a viewer as the recorder (viewers never own tasks)", async () => {
    partialMock(getVendorUserById).mockResolvedValue({ id: 5, name: "Read Only", email: "ro@vendor.test", role: "viewer" });
    expect((await put({ vendorUserId: 5 })).status).toBe(400);
    expect(setMinitiRecorder).not.toHaveBeenCalled();
  });

  it("PUT is closed to viewers", async () => {
    partialMock(getOrCreateVendorUser).mockResolvedValue({ id: 1, role: "viewer" });
    expect((await put({ vendorUserId: 4 })).status).toBe(403);
    expect(setMinitiRecorder).not.toHaveBeenCalled();
  });

  it("a database failure is a 500 with a plain message", async () => {
    vi.mocked(setMinitiRecorder).mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await put({ vendorUserId: 4 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't save the meeting recorder" });
  });
});
