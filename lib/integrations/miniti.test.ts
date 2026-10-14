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
  markExternalEventProcessed: vi.fn(async () => undefined),
  setExternalEventOrchestratorIO: vi.fn(async () => undefined),
  createMeetingDrafts: vi.fn(async () => []),
  getTasksForOnboarding: vi.fn(),
  getPhasesForOnboarding: vi.fn(),
  listVendorUsers: vi.fn(),
  getOnboarding: vi.fn(async () => ({ id: 10, companyName: "Acme" })),
  getMinitiRecorder: vi.fn(async () => null),
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
  getExternalEvent,
  getTasksForOnboarding,
  getPhasesForOnboarding,
  listVendorUsers,
  getMinitiRecorder,
  createMeetingDrafts,
  setExternalEventOrchestratorIO,
} from "@/lib/db";
import { runMinitiExtraction, runMinitiOrchestrator, toolCallToAction } from "@/lib/ai/orchestrator";
import {
  validateMinitiPayload,
  matchMeetingToOnboarding,
  buildOrchestratorContext,
  processMinitiEvent,
  runMeetingExtractionOnly,
} from "./miniti";
import type { MinitiMeeting } from "./miniti";

/**
 * Point the mocked DB at a tiny in-memory world:
 *   companies: [{ id, name, domain }]
 *   onboardingsByCompany: { [companyId]: [onboardingId, ...] }
 *   contactsByOnboarding: { [onboardingId]: [{ email }, ...] }
 */
type Resolved<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

// Fixtures carry only the fields the heuristic reads, so they are cast to the
// full db return types at the mock boundary.
function seedDb({
  companies = [],
  onboardingsByCompany = {},
  contactsByOnboarding = {},
}: {
  companies?: { id: number; name: string; domain: string | null }[];
  onboardingsByCompany?: Record<string, number[]>;
  contactsByOnboarding?: Record<string, { email: string }[]>;
}) {
  vi.mocked(getCompanies).mockResolvedValue(companies as Resolved<typeof getCompanies>);
  vi.mocked(getOnboardingsByCompanyId).mockImplementation(async (companyId) =>
    (onboardingsByCompany[String(companyId)] ?? []).map((id) => ({ id })) as unknown as Resolved<
      typeof getOnboardingsByCompanyId
    >
  );
  const allOnboardings = Object.values(onboardingsByCompany)
    .flat()
    .map((id) => ({ id }));
  vi.mocked(getOnboardings).mockResolvedValue(allOnboardings as unknown as Resolved<typeof getOnboardings>);
  vi.mocked(getContactsForOnboarding).mockImplementation(
    async (onboardingId) =>
      (contactsByOnboarding[String(onboardingId)] ?? []) as unknown as Resolved<typeof getContactsForOnboarding>
  );
}

const meeting = (overrides: Partial<MinitiMeeting> = {}): MinitiMeeting => ({
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

  it("labels each turn with its speaker, so the model can tell whose promise it was", () => {
    const ctx = buildOrchestratorContext({
      ...base,
      meeting: meeting({
        transcript: [
          { speaker: "You", text: "I'll send the export today." },
          { speaker: "Speaker 1", text: "Great." },
          { speaker: "  ", text: "No label." },
        ],
      }),
    });
    expect(ctx.meeting.transcript).toBe("You: I'll send the export today.\nSpeaker 1: Great.\nNo label.");
  });

  it("carries the recorder (who \"You\" is) as { id, name }, or null when nobody is set", () => {
    expect(buildOrchestratorContext(base).recorder).toBe(null);
    const ctx = buildOrchestratorContext({ ...base, recorder: { id: 3, name: "Robin Vale" } });
    expect(ctx.recorder).toEqual({ id: 3, name: "Robin Vale" });
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

  it("gives each open task its owner and priority, so the model can compare them with the call", () => {
    const ctx = buildOrchestratorContext({
      ...base,
      tasks: [{ id: 1, taskId: "AC-1", title: "Open task", status: "In progress", phaseId: 5, ownerId: 3, priority: "high" }],
    });
    expect(ctx.openTasks[0]).toMatchObject({ ownerId: 3, priority: "high" });
    expect(buildOrchestratorContext(base).openTasks[0]).toMatchObject({ ownerId: null, priority: null });
  });

  it("lists each open task's OPEN dependencies as dependsOn, in the tools' shape", () => {
    const ctx = buildOrchestratorContext({
      ...base,
      tasks: [
        {
          id: 1, taskId: "AC-1", title: "Open task", status: "In progress", phaseId: 5,
          dependencies: [
            { id: 10, blockedByTask: { id: 4, taskId: "AC-4", title: "Export", status: "In progress" } },
            { id: 11, blockedByTask: { id: 2, taskId: "AC-2", title: "Done one", status: "Done" } },
            { id: 12, label: "budget approval", resolvedAt: null },
            { id: 13, label: "old sign-off", resolvedAt: "2026-07-01T00:00:00Z" },
          ],
        },
        // A row without loaded dependencies falls back to the legacy column.
        { id: 5, taskId: "AC-5", title: "Legacy", status: "Not started", phaseId: 5, blockedByTaskId: 1 },
      ],
    });
    expect(ctx.openTasks[0].dependsOn).toEqual([{ taskId: 4 }, { text: "budget approval" }]);
    expect(ctx.openTasks[1].dependsOn).toEqual([{ taskId: 1 }]);
    expect(ctx.openTasks[0]).not.toHaveProperty("blockedByTaskId");
  });
});

describe("processMinitiEvent: the recorder (\"You\")", () => {
  const event = {
    id: 77,
    processedAt: null,
    orchestratorExtraction: { actionItems: [] },
    payload: {
      meeting: meeting({ transcript: [{ speaker: "You", text: "I'll send the export today." }] }),
    },
  };
  const vendors = [
    { id: 3, name: "Robin Vale", email: "robin@vendor.test", role: "admin" },
    { id: 4, name: "Jules Park", email: "jules@vendor.test", role: "member" },
    { id: 5, name: "Read Only", email: "ro@vendor.test", role: "viewer" },
  ];
  const recorderCall = (input: Record<string, unknown>) => ({
    calls: [
      {
        tool: "create_task_draft",
        id: "t1",
        input: { draftRef: "d1", title: "Send the export", phaseId: 6, sourceQuote: "I'll send the export today.", ...input },
      },
    ],
    durationMs: 1,
  });
  const storedPayload = () => vi.mocked(createMeetingDrafts).mock.calls[0][0][0].payload as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getExternalEvent).mockResolvedValue(event as unknown as Awaited<ReturnType<typeof getExternalEvent>>);
    vi.mocked(getTasksForOnboarding).mockResolvedValue([]);
    vi.mocked(getContactsForOnboarding).mockResolvedValue([]);
    vi.mocked(getPhasesForOnboarding).mockResolvedValue([
      { id: 6, name: "Setup", isComplete: false, sortOrder: 1 },
    ] as unknown as Awaited<ReturnType<typeof getPhasesForOnboarding>>);
    vi.mocked(listVendorUsers).mockResolvedValue(vendors as unknown as Awaited<ReturnType<typeof listVendorUsers>>);
    vi.mocked(toolCallToAction).mockImplementation((tool) => (tool === "create_task_draft" ? "create_task" : "no_action"));
    vi.mocked(setExternalEventOrchestratorIO).mockResolvedValue(undefined as never);
    vi.mocked(createMeetingDrafts).mockImplementation(async (rows) => rows.map((_, i) => ({ id: i + 1 })) as never);
  });

  it("puts the configured recorder in Pass 2's context", async () => {
    vi.mocked(getMinitiRecorder).mockResolvedValue({ id: 4, name: "Jules Park", email: "jules@vendor.test" });
    vi.mocked(runMinitiOrchestrator).mockResolvedValue(recorderCall({ ownerId: 4 }) as never);
    await processMinitiEvent(77, 10);
    const { context } = vi.mocked(runMinitiOrchestrator).mock.calls[0][0];
    expect(context.recorder).toEqual({ id: 4, name: "Jules Park" });
    expect(context.meeting.transcript).toBe("You: I'll send the export today.");
    expect(storedPayload()).toMatchObject({ ownerId: 4, ownerName: "Jules Park" });
    expect(storedPayload()).not.toHaveProperty("ownerFromRecorder");
  });

  it("gives a flagged recorder commitment to the configured recorder", async () => {
    vi.mocked(getMinitiRecorder).mockResolvedValue({ id: 4, name: "Jules Park", email: "jules@vendor.test" });
    vi.mocked(runMinitiOrchestrator).mockResolvedValue(recorderCall({ ownerFromRecorder: true }) as never);
    await processMinitiEvent(77, 10);
    expect(storedPayload()).toMatchObject({ ownerId: 4, ownerName: "Jules Park" });
    expect(storedPayload()).not.toHaveProperty("ownerFromRecorder");
  });

  it("with no recorder set, leaves the owner empty and keeps the flag for the inbox", async () => {
    vi.mocked(getMinitiRecorder).mockResolvedValue(null);
    vi.mocked(runMinitiOrchestrator).mockResolvedValue(recorderCall({ ownerFromRecorder: true, ownerId: 3 }) as never);
    await processMinitiEvent(77, 10);
    expect(vi.mocked(runMinitiOrchestrator).mock.calls[0][0].context.recorder).toBe(null);
    expect(storedPayload()).toMatchObject({ ownerFromRecorder: true });
    expect(storedPayload()).not.toHaveProperty("ownerId");
    expect(storedPayload()).not.toHaveProperty("ownerName");
  });

  it("treats a recorder who cannot own work (not on the owner list) as not set", async () => {
    vi.mocked(getMinitiRecorder).mockResolvedValue({ id: 99, name: "Gone", email: "gone@vendor.test" });
    vi.mocked(runMinitiOrchestrator).mockResolvedValue(recorderCall({ ownerFromRecorder: true }) as never);
    await processMinitiEvent(77, 10);
    expect(vi.mocked(runMinitiOrchestrator).mock.calls[0][0].context.recorder).toBe(null);
    expect(storedPayload()).toMatchObject({ ownerFromRecorder: true });
  });

  it("drops a flag that is not exactly true", async () => {
    vi.mocked(getMinitiRecorder).mockResolvedValue(null);
    vi.mocked(runMinitiOrchestrator).mockResolvedValue(recorderCall({ ownerFromRecorder: "yes", ownerId: 3 }) as never);
    await processMinitiEvent(77, 10);
    expect(storedPayload()).toMatchObject({ ownerId: 3 });
    expect(storedPayload()).not.toHaveProperty("ownerFromRecorder");
  });

  it("Pass 1 on an unmatched meeting sees the recorder too", async () => {
    vi.mocked(getMinitiRecorder).mockResolvedValue({ id: 4, name: "Jules Park", email: "jules@vendor.test" });
    vi.mocked(runMinitiExtraction).mockResolvedValue({ extraction: { actionItems: [] } } as never);
    await runMeetingExtractionOnly(78, event.payload.meeting);
    expect(vi.mocked(runMinitiExtraction).mock.calls[0][0].context.recorder).toEqual({ id: 4, name: "Jules Park" });
  });
});
