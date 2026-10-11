import { describe, it, expect, beforeEach, vi } from "vitest";

// lib/db.js opens a Prisma client at import time. These tests check the
// projection/mapping logic around Prisma calls, so the generated client and
// the pg adapter are mocked with a fake whose model methods are vi.fn()s.
// No database is touched.
const { prismaMock, DbNull } = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unit-test@localhost/none";
  const DbNull = { __dbNull: true };
  const prismaMock = {
    externalEvent: { update: vi.fn() },
    contact: { findMany: vi.fn() },
    onboarding: { findMany: vi.fn() },
  };
  return { prismaMock, DbNull };
});

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn(function () {}) }));
vi.mock("./generated/prisma/client", () => ({
  PrismaClient: vi.fn(function () { return prismaMock; }),
  Prisma: { DbNull },
}));
vi.mock("./email.js", () => ({ sendTaskAssigned: vi.fn(), sendTaskCommented: vi.fn() }));

import {
  setExternalEventOrchestratorIO,
  getContactsForOnboarding,
  getOnboardings,
} from "./db.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setExternalEventOrchestratorIO", () => {
  it("writes a failed (null) extraction as Prisma.DbNull, not a bare null", async () => {
    await setExternalEventOrchestratorIO(7, { input: { a: 1 }, extraction: null });
    expect(prismaMock.externalEvent.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { orchestratorInput: { a: 1 }, orchestratorExtraction: DbNull },
    });
  });

  it("leaves undefined fields out so passes don't clobber each other", async () => {
    await setExternalEventOrchestratorIO(7, { output: [] });
    expect(prismaMock.externalEvent.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { orchestratorOutput: [] },
    });
  });
});

describe("getContactsForOnboarding", () => {
  it("returns lastSeenPortalAt so insights can measure portal engagement", async () => {
    prismaMock.contact.findMany.mockResolvedValue([
      { id: 1, onboardingId: 3, name: "A", email: "a@x.co", role: null, bouncedAt: null,
        lastSeenPortalAt: new Date("2026-10-01T09:00:00Z") },
      { id: 2, onboardingId: 3, name: "B", email: "b@x.co", role: null, bouncedAt: null,
        lastSeenPortalAt: null },
    ]);
    const contacts = await getContactsForOnboarding(3);
    expect(contacts.map((c) => c.lastSeenPortalAt)).toEqual(["2026-10-01T09:00:00.000Z", null]);
  });
});

describe("getOnboardings", () => {
  it("returns targetGoLive so the portfolio snapshot can compute days to go-live", async () => {
    prismaMock.onboarding.findMany.mockResolvedValue([
      { id: 5, status: "Active", owner: null, updatedAt: null, createdAt: new Date("2026-09-01"),
        targetGoLive: new Date("2026-11-01T00:00:00Z"),
        company: { name: "Acme", logoUrl: null }, tasks: [] },
    ]);
    const [ob] = await getOnboardings("Active");
    expect(ob.targetGoLive).toBe("2026-11-01T00:00:00.000Z");
  });
});
