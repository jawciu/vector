/**
 * Miniti webhook payload helpers.
 *
 * - validateMinitiPayload: schema-validate the incoming JSON
 * - matchMeetingToOnboarding: deterministic heuristic match
 *     (domain → email → fuzzy title → ambiguous)
 *
 * Per Ian's spec on 2026-04-28: no HMAC signing, no retries, idempotent on
 * meeting.id. Receiver authenticates via a `?token=` query param against
 * MINITI_WEBHOOK_TOKEN.
 *
 * Field rules (always present): event, meeting.id, title, date,
 *   duration_seconds, language, action_items, key_decisions, topics,
 *   discussion_flow, notes, speaker_count, transcript.
 * Often omitted entirely: summary, end_time, meddpicc, training, questions,
 *   speaker_names, calendar_event_id, attendees.
 */

import {
  getCompanies,
  getContactsForOnboarding,
  getOnboardings,
  getOnboardingsByCompanyId,
} from "@/lib/db";

/** Throws on invalid payload; returns parsed { event, meeting }. */
export function validateMinitiPayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("payload is not an object");
  }
  const { event, meeting } = body;
  if (event !== "meeting.saved" && event !== "meeting.updated") {
    throw new Error(`unsupported event "${event}"`);
  }
  if (!meeting || typeof meeting !== "object") {
    throw new Error("meeting field missing");
  }
  if (!meeting.id || typeof meeting.id !== "string") {
    throw new Error("meeting.id missing");
  }
  if (!meeting.title || typeof meeting.title !== "string") {
    throw new Error("meeting.title missing");
  }
  if (!meeting.date) {
    throw new Error("meeting.date missing");
  }
  // attendees + summary + meddpicc are intentionally optional per Ian's spec
  return { event, meeting };
}

/** Extract unique non-vendor email domains from attendees. */
function extractAttendeeDomains(meeting) {
  const attendees = meeting.attendees ?? [];
  const domains = new Set();
  for (const a of attendees) {
    if (a?.domain) domains.add(a.domain.toLowerCase());
  }
  return Array.from(domains);
}

/** Lowercase letters / digits only, normalised for fuzzy comparison. */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Match a Miniti meeting payload to one of our Onboardings.
 *
 * Returns { onboardingId, ambiguous, matchedBy, candidates }.
 *   onboardingId   — null if no confident match
 *   ambiguous      — true if matching heuristic produced >1 candidate
 *   matchedBy      — "domain" | "email" | "title" | null
 *   candidates     — array of { onboardingId, signal, evidence } for debugging
 */
export async function matchMeetingToOnboarding(meeting) {
  const candidates = [];

  // 1. Domain match — strongest signal. Compare attendee domains to Company.domain.
  const domains = extractAttendeeDomains(meeting);
  if (domains.length > 0) {
    const companies = await getCompanies();
    const matchingCompanies = companies.filter(
      (c) => c.domain && domains.includes(c.domain.toLowerCase())
    );
    for (const c of matchingCompanies) {
      const obs = await getOnboardingsByCompanyId(c.id);
      for (const ob of obs) {
        candidates.push({
          onboardingId: Number(ob.id),
          signal: "domain",
          evidence: `attendee domain ${c.domain} → ${c.name}`,
        });
      }
    }
  }

  // 2. Email match — attendee email → Contact lookup. (Slower but precise.)
  if (candidates.length === 0 && meeting.attendees?.length) {
    const onboardings = await getOnboardings("All");
    for (const ob of onboardings) {
      const contacts = await getContactsForOnboarding(ob.id);
      const matches = contacts.filter((c) =>
        c.email &&
        meeting.attendees.some(
          (a) => a.email && a.email.toLowerCase() === c.email.toLowerCase()
        )
      );
      if (matches.length > 0) {
        candidates.push({
          onboardingId: Number(ob.id),
          signal: "email",
          evidence: `contact email ${matches[0].email}`,
        });
      }
    }
  }

  // 3. Fuzzy title — meeting title contains company name.
  if (candidates.length === 0) {
    const titleNorm = normalize(meeting.title);
    const companies = await getCompanies();
    for (const c of companies) {
      const nameNorm = normalize(c.name);
      if (nameNorm.length >= 3 && titleNorm.includes(nameNorm)) {
        const obs = await getOnboardingsByCompanyId(c.id);
        for (const ob of obs) {
          candidates.push({
            onboardingId: Number(ob.id),
            signal: "title",
            evidence: `title "${meeting.title}" contains "${c.name}"`,
          });
        }
      }
    }
  }

  // Dedupe — same onboarding could appear multiple times via different signals.
  const uniqueIds = Array.from(new Set(candidates.map((c) => c.onboardingId)));

  if (uniqueIds.length === 0) {
    return { onboardingId: null, ambiguous: false, matchedBy: null, candidates: [] };
  }
  if (uniqueIds.length === 1) {
    return {
      onboardingId: uniqueIds[0],
      ambiguous: false,
      matchedBy: candidates[0].signal,
      candidates,
    };
  }
  // >1 distinct onboarding matched — surface for manual.
  return {
    onboardingId: null,
    ambiguous: true,
    matchedBy: null,
    candidates,
  };
}

/**
 * Build the AI orchestrator's user-message context from a Miniti meeting +
 * the matched onboarding's existing tasks/contacts/phases.
 *
 * The orchestrator prompt expects exactly this shape — single source of
 * truth so prompt and producer don't drift.
 */
export function buildOrchestratorContext({ meeting, tasks, contacts, phases, today = new Date() }) {
  const openTasks = tasks
    .filter((t) => t.status !== "Done")
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      phaseId: t.phaseId,
      due: t.due || null,
      assigneeContactId: t.assigneeContactId ?? null,
    }));

  const phasesLite = phases
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ id: p.id, name: p.name, isComplete: p.isComplete }));

  const customerContacts = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email || null,
  }));

  return {
    today: today.toISOString().slice(0, 10),
    meeting: {
      id: meeting.id,
      title: meeting.title,
      date: meeting.date,
      summary: meeting.summary ?? null,
      // Path A: Miniti's pre-extracted action items are the seed. Send them
      // verbatim — Claude's job is to match-or-create + attribute owner.
      actionItems: meeting.action_items ?? [],
      keyDecisions: meeting.key_decisions ?? [],
      notes: meeting.notes ?? null,
    },
    openTasks,
    phases: phasesLite,
    customerContacts,
  };
}
