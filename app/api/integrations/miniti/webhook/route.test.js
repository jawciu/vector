import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The route handler is tested as a plain function: build a standard Request,
// call POST(), assert on the Response. Everything the route talks to is
// mocked — validation/matching (unit-tested in lib/integrations/miniti.test.js),
// the DB, and next/server's after(), which is captured into `scheduled` so
// tests can assert what background work WOULD run (and run it) without Next.
const scheduled = [];
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
  after: vi.fn((cb) => scheduled.push(cb)),
}));

vi.mock("@/lib/integrations/miniti", () => ({
  validateMinitiPayload: vi.fn(),
  matchMeetingToOnboarding: vi.fn(),
  processMinitiEvent: vi.fn(),
  runMeetingExtractionOnly: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  createExternalEvent: vi.fn(),
  markExternalEventProcessed: vi.fn(),
}));

import {
  validateMinitiPayload,
  matchMeetingToOnboarding,
  processMinitiEvent,
  runMeetingExtractionOnly,
} from "@/lib/integrations/miniti";
import { createExternalEvent, markExternalEventProcessed } from "@/lib/db";
import { POST } from "./route.js";

const TOKEN = "test-secret";

const MEETING = { id: "mtg_1", title: "Acme sync", date: "2026-07-09" };
const PAYLOAD = { event: "meeting.saved", meeting: MEETING };

function post({ token = TOKEN, body = PAYLOAD } = {}) {
  const qs = token === null ? "" : `?token=${token}`;
  return POST(
    new Request(`http://localhost/api/integrations/miniti/webhook${qs}`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduled.length = 0;
  vi.stubEnv("MINITI_WEBHOOK_TOKEN", TOKEN);
  // The route logs expected failures (bad token, bad payload) — keep test
  // output clean without hiding assertion failures.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Happy-path defaults; individual tests override.
  validateMinitiPayload.mockImplementation((body) => body);
  matchMeetingToOnboarding.mockResolvedValue({
    onboardingId: 10,
    ambiguous: false,
    matchedBy: "domain",
    candidates: [],
  });
  createExternalEvent.mockResolvedValue({ id: 555 });
  processMinitiEvent.mockResolvedValue({ draftIds: [1] });
  runMeetingExtractionOnly.mockResolvedValue({ extraction: {} });
  markExternalEventProcessed.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/integrations/miniti/webhook", () => {
  describe("auth", () => {
    it("returns 500 when MINITI_WEBHOOK_TOKEN is not configured", async () => {
      vi.stubEnv("MINITI_WEBHOOK_TOKEN", "");
      const res = await post();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Server misconfigured" });
    });

    it("returns 401 on a wrong token", async () => {
      const res = await post({ token: "wrong" });
      expect(res.status).toBe(401);
      expect(createExternalEvent).not.toHaveBeenCalled();
    });

    it("returns 401 when the token param is missing entirely", async () => {
      const res = await post({ token: null });
      expect(res.status).toBe(401);
    });
  });

  describe("payload validation", () => {
    it("returns 400 with the reason when validation rejects", async () => {
      validateMinitiPayload.mockImplementation(() => {
        throw new Error("meeting.id missing");
      });
      const res = await post({ body: { event: "meeting.saved" } });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid payload: meeting.id missing");
      expect(createExternalEvent).not.toHaveBeenCalled();
    });

    it("returns 400 when the body is not JSON at all", async () => {
      const res = await POST(
        new Request(`http://localhost/api/integrations/miniti/webhook?token=${TOKEN}`, {
          method: "POST",
          body: "definitely not json",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("confident match", () => {
    it("acks 200 with the match details", async () => {
      const res = await post();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        eventId: 555,
        onboardingId: 10,
        matchedBy: "domain",
        ambiguous: false,
      });
    });

    it("records the ExternalEvent with the meeting payload and match", async () => {
      await post();
      expect(createExternalEvent).toHaveBeenCalledWith({
        source: "miniti",
        sourceId: "mtg_1",
        occurredAt: "2026-07-09",
        payload: PAYLOAD,
        onboardingId: 10,
        matchAmbiguous: false,
      });
    });

    it("schedules the full orchestrator (not extraction-only) for after the ack", async () => {
      await post();
      expect(scheduled).toHaveLength(1);
      expect(processMinitiEvent).not.toHaveBeenCalled(); // nothing runs pre-ack

      await scheduled[0]();
      expect(processMinitiEvent).toHaveBeenCalledWith(555, 10);
      expect(runMeetingExtractionOnly).not.toHaveBeenCalled();
    });

    it("marks the event with the error when the background orchestrator dies", async () => {
      processMinitiEvent.mockRejectedValue(new Error("model timeout"));
      await post();
      await scheduled[0]();
      expect(markExternalEventProcessed).toHaveBeenCalledWith(555, {
        error: "model timeout",
      });
    });
  });

  describe("ambiguous match", () => {
    beforeEach(() => {
      matchMeetingToOnboarding.mockResolvedValue({
        onboardingId: null,
        ambiguous: true,
        matchedBy: null,
        candidates: [],
      });
    });

    it("still acks 200, flagged ambiguous", async () => {
      const res = await post();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, ambiguous: true, onboardingId: null });
    });

    it("schedules extraction-only — Pass 2 must wait for manual assignment", async () => {
      await post();
      expect(scheduled).toHaveLength(1);
      await scheduled[0]();
      expect(runMeetingExtractionOnly).toHaveBeenCalledWith(555, MEETING);
      expect(processMinitiEvent).not.toHaveBeenCalled();
    });
  });

  describe("resilience — Miniti never retries, so never drop a meeting", () => {
    it("acks 200 and stores the event even when matching throws", async () => {
      matchMeetingToOnboarding.mockRejectedValue(new Error("db hiccup"));
      const res = await post();
      expect(res.status).toBe(200);
      expect(createExternalEvent).toHaveBeenCalledWith(
        expect.objectContaining({ onboardingId: null })
      );
      expect(scheduled).toHaveLength(0); // no match → no background work
    });

    it("returns { deduped: true } and schedules nothing on a duplicate meeting.id", async () => {
      createExternalEvent.mockResolvedValue(null);
      const res = await post();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, deduped: true });
      expect(scheduled).toHaveLength(0);
    });

    it("returns 500 when the event insert fails — the one case Miniti should see as an error", async () => {
      createExternalEvent.mockRejectedValue(new Error("connection refused"));
      const res = await post();
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("Failed to record event");
    });
  });
});
