import { describe, it, expect, beforeEach, vi } from "vitest";

// miniti.js imports lib/db (which opens a Prisma connection) and the AI
// orchestrator (which needs an Anthropic key). Unit tests must run without
// either, so both modules are mocked before miniti.js is imported. The
// matching heuristic's DB reads are stubbed per-test via seedDb().
vi.mock("@/lib/db", () => ({
  getCompanies: vi.fn(),
  getContactsForOnboarding: vi.fn(),
  getOnboardings: vi.fn(),
  getOnboardingsByCompanyId: vi.fn(),
  getExternalEvent: vi.fn(),
  markExternalEventProcessed: vi.fn(),
  setExternalEventOrchestratorIO: vi.fn(),
  createPendingAIChange: vi.fn(),
  getTasksForOnboarding: vi.fn(),
  getPhasesForOnboarding: vi.fn(),
  listVendorUsers: vi.fn(),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  runMinitiExtraction: vi.fn(),
  runMinitiOrchestrator: vi.fn(),
  toolCallToAction: vi.fn(),
}));

import {
  getCompanies,
  getContactsForOnboarding,
  getOnboardings,
  getOnboardingsByCompanyId,
} from "@/lib/db";
import {
  validateMinitiPayload,
  matchMeetingToOnboarding,
  buildOrchestratorContext,
} from "./miniti.js";

/**
 * Point the mocked DB at a tiny in-memory world:
 *   companies: [{ id, name, domain }]
 *   onboardingsByCompany: { [companyId]: [onboardingId, ...] }
 *   contactsByOnboarding: { [onboardingId]: [{ email }, ...] }
 */
function seedDb({ companies = [], onboardingsByCompany = {}, contactsByOnboarding = {} }) {
  getCompanies.mockResolvedValue(companies);
  getOnboardingsByCompanyId.mockImplementation(async (companyId) =>
    (onboardingsByCompany[companyId] ?? []).map((id) => ({ id }))
  );
  const allOnboardings = Object.values(onboardingsByCompany)
    .flat()
    .map((id) => ({ id }));
  getOnboardings.mockResolvedValue(allOnboardings);
  getContactsForOnboarding.mockImplementation(
    async (onboardingId) => contactsByOnboarding[onboardingId] ?? []
  );
}

const meeting = (overrides = {}) => ({
  id: "mtg_1",
  title: "Weekly sync",
  date: "2026-07-08",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  seedDb({});
});

describe("validateMinitiPayload", () => {
  it("accepts a well-formed meeting.saved payload", () => {
    const body = { event: "meeting.saved", meeting: meeting() };
    expect(validateMinitiPayload(body)).toEqual(body);
  });

  it("accepts meeting.updated", () => {
    const body = { event: "meeting.updated", meeting: meeting() };
    expect(validateMinitiPayload(body)).toEqual(body);
  });

  it.each([
    [null, "payload is not an object"],
    [{ event: "meeting.deleted", meeting: {} }, 'unsupported event "meeting.deleted"'],
    [{ event: "meeting.saved" }, "meeting field missing"],
    [{ event: "meeting.saved", meeting: { title: "x", date: "2026-07-08" } }, "meeting.id missing"],
    [{ event: "meeting.saved", meeting: { id: 42, title: "x", date: "2026-07-08" } }, "meeting.id missing"],
    [{ event: "meeting.saved", meeting: { id: "m1", date: "2026-07-08" } }, "meeting.title missing"],
    [{ event: "meeting.saved", meeting: { id: "m1", title: "x" } }, "meeting.date missing"],
  ])("rejects %j", (body, message) => {
    expect(() => validateMinitiPayload(body)).toThrow(message);
  });
});

describe("matchMeetingToOnboarding", () => {
  describe("signal 1: attendee domain", () => {
    it("matches when an attendee domain equals a company domain", async () => {
      seedDb({
        companies: [{ id: 1, name: "Acme Co", domain: "acme.com" }],
        onboardingsByCompany: { 1: [10] },
      });
      const result = await matchMeetingToOnboarding(
        meeting({ attendees: [{ email: "jo@acme.com", domain: "acme.com" }] })
      );
      expect(result).toMatchObject({ onboardingId: 10, ambiguous: false, matchedBy: "domain" });
    });

    it("matches domains case-insensitively", async () => {
      seedDb({
        companies: [{ id: 1, name: "Acme Co", domain: "Acme.com" }],
        onboardingsByCompany: { 1: [10] },
      });
      const result = await matchMeetingToOnboarding(
        meeting({ attendees: [{ domain: "ACME.COM" }] })
      );
      expect(result.onboardingId).toBe(10);
    });
  });

  describe("signal 2: attendee email → contact", () => {
    it("falls back to contact-email match when no domain matches", async () => {
      seedDb({
        companies: [{ id: 1, name: "Acme Co", domain: "acme.com" }],
        onboardingsByCompany: { 1: [10] },
        contactsByOnboarding: { 10: [{ email: "pat@consultant.example" }] },
      });
      const result = await matchMeetingToOnboarding(
        meeting({ attendees: [{ email: "PAT@consultant.example", domain: "consultant.example" }] })
      );
      expect(result).toMatchObject({ onboardingId: 10, ambiguous: false, matchedBy: "email" });
    });
  });

  describe("signal 3: fuzzy title", () => {
    beforeEach(() => {
      seedDb({
        companies: [
          { id: 1, name: "Acme Co", domain: null },
          { id: 2, name: "Globex", domain: null },
        ],
        onboardingsByCompany: { 1: [10], 2: [20] },
      });
    });

    it("matches a significant company word in the title", async () => {
      const result = await matchMeetingToOnboarding(meeting({ title: "Acme weekly sync" }));
      expect(result).toMatchObject({ onboardingId: 10, ambiguous: false, matchedBy: "title" });
    });

    it("matches case-insensitively", async () => {
      const result = await matchMeetingToOnboarding(meeting({ title: "ACME kickoff" }));
      expect(result.onboardingId).toBe(10);
    });

    it("ignores corporate stopwords — 'Co' alone must not match", async () => {
      const result = await matchMeetingToOnboarding(
        meeting({ title: "Co-design workshop planning" })
      );
      expect(result.onboardingId).toBe(null);
    });

    it("requires word boundaries — 'Acme' must not match 'academy'", async () => {
      const result = await matchMeetingToOnboarding(
        meeting({ title: "Sales academy training" })
      );
      expect(result.onboardingId).toBe(null);
    });
  });

  describe("signal 4: fuzzy content (summary / topics / notes / transcript)", () => {
    beforeEach(() => {
      seedDb({
        companies: [
          { id: 1, name: "Acme Co", domain: null },
          { id: 2, name: "Globex", domain: null },
        ],
        onboardingsByCompany: { 1: [10], 2: [20] },
      });
    });

    it("matches a company name said in the transcript when the title is generic", async () => {
      const result = await matchMeetingToOnboarding(
        meeting({
          title: "Untitled meeting",
          transcript: [{ text: "Right, so the Acme rollout is next." }],
        })
      );
      expect(result).toMatchObject({ onboardingId: 10, ambiguous: false, matchedBy: "content" });
    });

    it("matches via topics and summary too", async () => {
      const result = await matchMeetingToOnboarding(
        meeting({ title: "Untitled meeting", topics: ["Globex migration"] })
      );
      expect(result.onboardingId).toBe(20);
    });

    it("goes ambiguous when two companies appear in the content", async () => {
      const result = await matchMeetingToOnboarding(
        meeting({
          title: "Untitled meeting",
          summary: "Compared the Acme setup with what Globex asked for.",
        })
      );
      expect(result).toMatchObject({ onboardingId: null, ambiguous: true, matchedBy: null });
      expect(result.candidates).toHaveLength(2);
    });
  });

  describe("ambiguity + precedence", () => {
    it("returns ambiguous (not a silent miss) when nothing matches", async () => {
      seedDb({
        companies: [{ id: 1, name: "Acme Co", domain: "acme.com" }],
        onboardingsByCompany: { 1: [10] },
      });
      const result = await matchMeetingToOnboarding(meeting({ title: "1:1 with Sam" }));
      expect(result).toMatchObject({ onboardingId: null, ambiguous: true, candidates: [] });
    });

    it("goes ambiguous when a domain matches two companies' onboardings", async () => {
      seedDb({
        companies: [
          { id: 1, name: "Acme Co", domain: "acme.com" },
          { id: 2, name: "Acme Labs", domain: "acme.com" },
        ],
        onboardingsByCompany: { 1: [10], 2: [20] },
      });
      const result = await matchMeetingToOnboarding(
        meeting({ attendees: [{ domain: "acme.com" }] })
      );
      expect(result.ambiguous).toBe(true);
      expect(result.onboardingId).toBe(null);
    });

    it("prefers the domain signal — title mentions of other companies are never reached", async () => {
      seedDb({
        companies: [
          { id: 1, name: "Acme Co", domain: "acme.com" },
          { id: 2, name: "Globex", domain: "globex.com" },
        ],
        onboardingsByCompany: { 1: [10], 2: [20] },
      });
      const result = await matchMeetingToOnboarding(
        meeting({ title: "Globex catch-up", attendees: [{ domain: "acme.com" }] })
      );
      expect(result).toMatchObject({ onboardingId: 10, matchedBy: "domain", ambiguous: false });
    });

    it("dedupes when one onboarding matches via multiple title words", async () => {
      seedDb({
        companies: [{ id: 1, name: "Acme Dynamite Logistics", domain: null }],
        onboardingsByCompany: { 1: [10] },
      });
      const result = await matchMeetingToOnboarding(
        meeting({ title: "Acme Dynamite check-in" })
      );
      expect(result).toMatchObject({ onboardingId: 10, ambiguous: false });
    });
  });
});

describe("buildOrchestratorContext", () => {
  const base = {
    meeting: meeting({
      summary: "Kickoff",
      action_items: ["Send questionnaire"],
      transcript: [{ text: "Hello." }, { text: null }, { text: "Bye." }],
    }),
    tasks: [
      { id: 1, taskId: "AC-1", title: "Open task", status: "In progress", phaseId: 5 },
      { id: 2, taskId: "AC-2", title: "Finished task", status: "Done", phaseId: 5 },
    ],
    contacts: [{ id: 7, name: "Pat", email: null, phone: "555" }],
    phases: [
      { id: 6, name: "Setup", isComplete: false, sortOrder: 2 },
      { id: 5, name: "Discovery", isComplete: true, sortOrder: 1 },
    ],
    vendorUsers: [{ id: 3, name: "Caroline", email: "c@vector.test", role: "admin" }],
    today: new Date("2026-07-08T12:00:00"),
  };

  it("excludes Done tasks from openTasks", () => {
    const ctx = buildOrchestratorContext(base);
    expect(ctx.openTasks.map((t) => t.id)).toEqual([1]);
  });

  it("sorts phases by sortOrder and strips them to id/name/isComplete", () => {
    const ctx = buildOrchestratorContext(base);
    expect(ctx.phases).toEqual([
      { id: 5, name: "Discovery", isComplete: true },
      { id: 6, name: "Setup", isComplete: false },
    ]);
  });

  it("joins transcript segments into one string, skipping empty ones", () => {
    const ctx = buildOrchestratorContext(base);
    expect(ctx.meeting.transcript).toBe("Hello.\nBye.");
  });

  it("tolerates a meeting with no transcript or action items", () => {
    const ctx = buildOrchestratorContext({ ...base, meeting: meeting() });
    expect(ctx.meeting.transcript).toBe("");
    expect(ctx.meeting.actionItems).toEqual([]);
    expect(ctx.meeting.summary).toBe(null);
  });

  it("stamps today as an ISO date", () => {
    const ctx = buildOrchestratorContext(base);
    expect(ctx.today).toBe("2026-07-08");
  });
});
