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
  getExternalEvent,
  markExternalEventProcessed,
  createPendingAIChange,
  getTasksForOnboarding,
  getPhasesForOnboarding,
} from "@/lib/db";
import { runMinitiOrchestrator, toolCallToAction } from "@/lib/ai/orchestrator";

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

/** Concatenate every textual field on a Miniti meeting that's likely to
 *  contain the customer's name when the title doesn't. Order doesn't
 *  matter — we just substring-search the whole blob. */
function extractContentText(meeting) {
  const parts = [
    meeting.summary,
    Array.isArray(meeting.topics) ? meeting.topics.join(" ") : "",
    meeting.notes,
    Array.isArray(meeting.transcript)
      ? meeting.transcript.map((t) => t?.text || "").join(" ")
      : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/** Common corporate-suffix and grammatical stopwords that aren't useful
 *  identifiers on their own. "Acme Co" → significant word is "Acme",
 *  not "Co" (which would match too eagerly). */
const COMPANY_STOPWORDS = new Set([
  "co", "inc", "ltd", "llc", "corp", "company", "the", "and", "of", "for",
]);

/** Extract the meaningful words from a company name for fuzzy matching.
 *  "Acme Co" → ["Acme"]
 *  "TechCorp Inc" → ["TechCorp"]
 *  "Globex" → ["Globex"]
 *  "AI Co" → ["AI"]   (kept because length ≥ 2 and not a stopword) */
function significantCompanyWords(name) {
  return String(name || "")
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length >= 2 && !COMPANY_STOPWORDS.has(w.toLowerCase()));
}

/** Does any significant word of `name` appear with word boundaries in `text`?
 *  - "Acme Co" matches "Acme weekly sync" (via the "Acme" token)
 *  - Word boundaries prevent "Acme" matching "academy"
 *  - Stopword filter prevents "Co" matching anything with "co" in it */
function companyNameMatchesText(name, text) {
  if (!text) return false;
  const words = significantCompanyWords(name);
  if (words.length === 0) return false;
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(text)) return true;
  }
  return false;
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

  // 3. Title fuzzy — any significant word of the company name appears in
  //    the meeting title with word boundaries.
  //    "Acme Co" matches "Acme weekly sync" via the "Acme" token.
  if (candidates.length === 0 && meeting.title) {
    const companies = await getCompanies();
    for (const c of companies) {
      if (!companyNameMatchesText(c.name, meeting.title)) continue;
      const obs = await getOnboardingsByCompanyId(c.id);
      for (const ob of obs) {
        candidates.push({
          onboardingId: Number(ob.id),
          signal: "title",
          evidence: `title "${meeting.title}" mentions "${c.name}"`,
        });
      }
    }
  }

  // 4. Content fuzzy — company name appears in summary, topics, notes, or
  //    transcript. Catches the case where the meeting title is generic
  //    ("Untitled meeting") but Caroline said the customer name during the
  //    call. Less reliable than title — a single passing mention of a
  //    different customer can flip the match to ambiguous, which is the
  //    correct conservative behaviour (forces manual review).
  if (candidates.length === 0) {
    const contentText = extractContentText(meeting);
    if (contentText) {
      const companies = await getCompanies();
      for (const c of companies) {
        if (!companyNameMatchesText(c.name, contentText)) continue;
        const obs = await getOnboardingsByCompanyId(c.id);
        for (const ob of obs) {
          candidates.push({
            onboardingId: Number(ob.id),
            signal: "content",
            evidence: `transcript / summary / notes mention "${c.name}"`,
          });
        }
      }
    }
  }

  // Dedupe — same onboarding could appear multiple times via different signals.
  const uniqueIds = Array.from(new Set(candidates.map((c) => c.onboardingId)));

  if (uniqueIds.length === 1) {
    return {
      onboardingId: uniqueIds[0],
      ambiguous: false,
      matchedBy: candidates[0].signal,
      candidates,
    };
  }
  // 0 matches OR >1 matches — both surface to Caroline as "Needs your input".
  // (Originally 0-matches returned ambiguous=false and the event got
  //  silently stranded — see #stuck-events-bug-2026-04-29.)
  return {
    onboardingId: null,
    ambiguous: true,
    matchedBy: null,
    candidates,
  };
}

/**
 * Run the AI orchestrator on a single ExternalEvent that's already been
 * matched to an onboarding. Used by:
 *   - the webhook (after the 200 ack, via Next's after())
 *   - the manual-assign route (after the user picks an onboarding for an
 *     ambiguous event)
 *
 * Idempotent — bails out if event.processedAt is already set.
 */
export async function processMinitiEvent(eventId, onboardingId) {
  const event = await getExternalEvent(eventId);
  if (!event) throw new Error(`event ${eventId} not found`);
  if (event.processedAt) return { skipped: true, reason: "already processed" };

  const meeting = event.payload?.meeting;
  if (!meeting) throw new Error(`event ${eventId} has no meeting payload`);

  const [tasks, contacts, phases] = await Promise.all([
    getTasksForOnboarding(onboardingId),
    getContactsForOnboarding(onboardingId),
    getPhasesForOnboarding(onboardingId),
  ]);

  const context = buildOrchestratorContext({ meeting, tasks, contacts, phases });
  const result = await runMinitiOrchestrator({ context, kind: "transcript" });

  const draftIds = [];
  for (const call of result.calls) {
    const action = toolCallToAction(call.tool);
    if (action === "no_action") continue;
    const draft = await createPendingAIChange({
      source: "miniti",
      sourceEventId: eventId,
      onboardingId,
      action,
      payload: call.input,
      sourceQuote: call.input.sourceQuote ?? null,
      sourceUrl: null,
      confidence: call.input.confidence ?? "medium",
    });
    draftIds.push(draft.id);
  }

  await markExternalEventProcessed(eventId);
  return { skipped: false, draftIds, callCount: result.calls.length, durationMs: result.durationMs };
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
