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
  setExternalEventOrchestratorIO,
  createPendingAIChange,
  getTasksForOnboarding,
  getPhasesForOnboarding,
  listVendorUsers,
} from "@/lib/db";
import { runMinitiExtraction, runMinitiOrchestrator, toolCallToAction } from "@/lib/ai/orchestrator";

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
 * Pass 1 only — runs the transcript-only extraction on a freshly received
 * meeting that hasn't been matched to an onboarding yet (i.e. ambiguous
 * matches). The extraction prompt is purely transcript-driven so we can
 * surface what Vector saw in the meeting on the pipeline timeline before
 * a human picks the onboarding. Pass 2 still has to wait for assignment
 * because it needs the onboarding's tasks/contacts/phases as context.
 *
 * The result is persisted to ExternalEvent.orchestratorExtraction so
 * processMinitiEvent (called on assign) can reuse it without paying for
 * a second Pass 1 round-trip.
 */
export async function runMeetingExtractionOnly(eventId, meeting) {
  if (!meeting) throw new Error(`runMeetingExtractionOnly: meeting required (event ${eventId})`);

  // Build a minimal context — the extraction prompt explicitly tolerates
  // empty onboarding-scoped lists ("for reference only — DO NOT resolve
  // to ids in this pass") so we can give it [] for tasks/contacts/etc.
  const context = buildOrchestratorContext({
    meeting,
    tasks: [],
    contacts: [],
    phases: [],
    vendorUsers: [],
  });

  let extraction = null;
  try {
    const ext = await runMinitiExtraction({ context });
    extraction = ext.extraction;
  } catch (err) {
    console.warn(`[miniti] standalone extraction failed for event ${eventId}: ${err.message}`);
  }

  // Persist whatever we got (or null on failure). Saving the input too
  // gives the debug surface something to show even if Pass 1 errored.
  await setExternalEventOrchestratorIO(eventId, {
    input: context,
    extraction,
  }).catch((err) =>
    console.warn(`[miniti] persist standalone extraction failed for event ${eventId}`, err)
  );

  return { extraction };
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

  const [tasks, contacts, phases, allVendorUsers] = await Promise.all([
    getTasksForOnboarding(onboardingId),
    getContactsForOnboarding(onboardingId),
    getPhasesForOnboarding(onboardingId),
    listVendorUsers(),
  ]);

  // Vector picks `ownerId` for create_task drafts from this list. Filter out
  // viewers/disabled roles — they shouldn't be assigned work.
  const vendorUsers = allVendorUsers
    .filter((u) => u.role === "admin" || u.role === "member")
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  const context = buildOrchestratorContext({ meeting, tasks, contacts, phases, vendorUsers });

  // ---- Pass 1: extract structured facts from the transcript ----
  // If the webhook already ran a standalone Pass 1 (ambiguous match path),
  // reuse the cached extraction off the event row instead of paying for it
  // again. Only re-run when nothing was persisted (e.g. earlier failure).
  let extraction = event.orchestratorExtraction ?? null;
  if (extraction == null) {
    try {
      const ext = await runMinitiExtraction({ context });
      extraction = ext.extraction;
    } catch (err) {
      console.warn(`[miniti] extraction (pass 1) failed: ${err.message}`);
    }
  } else {
    console.log(`[miniti] reusing cached pass 1 extraction for event ${eventId}`);
  }

  // Persist Pass 1 (and the now-richer onboarding-scoped input) so the
  // debug viewer shows up-to-date context even when extraction was cached.
  await setExternalEventOrchestratorIO(eventId, {
    input: context,
    extraction,
  }).catch((err) =>
    console.warn("[miniti] persist orchestrator extraction failed", err)
  );

  // ---- Pass 2: decide what tool calls to emit given the extracted facts ----
  const result = await runMinitiOrchestrator({ context, extraction, kind: "miniti_orchestrator" });

  // Persist Pass 2 output (the tool calls). Keeps the prior input + extraction
  // intact since this helper merges nullable fields.
  await setExternalEventOrchestratorIO(eventId, {
    output: result.calls,
  }).catch((err) =>
    console.warn("[miniti] persist orchestrator output failed", err)
  );

  // Cheap O(1) validation sets for the IDs we sent in context.
  const validVendorUserIds = new Set(vendorUsers.map((u) => u.id));
  const validContactIds = new Set(context.customerContacts.map((c) => c.id));
  const validOpenTaskIds = new Set(context.openTasks.map((t) => t.id));
  const validPhaseIds = new Set(context.phases.map((p) => p.id));

  const draftIds = [];
  for (let i = 0; i < result.calls.length; i++) {
    const call = result.calls[i];
    let action;
    try {
      action = toolCallToAction(call.tool);
    } catch (err) {
      // Unknown tool name — Claude went off-piste. Surface but don't crash.
      console.warn(
        `[miniti] tool call ${i} (${call.tool}) REJECTED: ${err.message}`
      );
      continue;
    }
    if (action === "no_action") {
      const reason = call.input?.reason ?? "no concrete action items";
      console.warn(
        `[miniti] tool call ${i} (${call.tool}) REJECTED: ${reason}`
      );
      continue;
    }

    // Sanitize the payload against what we actually sent to Claude. Drop fields
    // that reference an ID outside the context (Claude hallucinated). We drop
    // individual fields rather than rejecting whole drafts so the vendor still
    // sees the title/sourceQuote and can fill in the gaps.
    const payload = { ...call.input };

    if (action === "create_task") {
      if (payload.ownerId != null && !validVendorUserIds.has(payload.ownerId)) {
        console.warn(`[miniti] dropping invalid ownerId=${payload.ownerId} on create_task draft (event ${eventId})`);
        delete payload.ownerId;
      }
      if (payload.assigneeContactId != null && !validContactIds.has(payload.assigneeContactId)) {
        console.warn(`[miniti] dropping invalid assigneeContactId=${payload.assigneeContactId} on create_task draft (event ${eventId})`);
        delete payload.assigneeContactId;
      }
      if (payload.blockedByTaskId != null && !validOpenTaskIds.has(payload.blockedByTaskId)) {
        console.warn(`[miniti] dropping invalid blockedByTaskId=${payload.blockedByTaskId} on create_task draft (event ${eventId})`);
        delete payload.blockedByTaskId;
      }
      // phaseId is required by the tool schema; if Claude returned an invalid
      // one, fall back to the first non-complete phase rather than dropping.
      if (payload.phaseId == null || !validPhaseIds.has(payload.phaseId)) {
        const fallback = context.phases.find((p) => !p.isComplete) ?? context.phases[0];
        if (payload.phaseId != null) {
          console.warn(`[miniti] phaseId=${payload.phaseId} not in context, falling back to ${fallback?.id} (event ${eventId})`);
        }
        payload.phaseId = fallback?.id ?? null;
      }
    } else if (action === "match_existing" || action === "update_status") {
      // taskId must reference an open task in the context.
      if (payload.taskId == null || !validOpenTaskIds.has(payload.taskId)) {
        console.warn(`[miniti] skipping ${action} draft with invalid taskId=${payload.taskId} (event ${eventId})`);
        continue;
      }
    }

    const draft = await createPendingAIChange({
      source: "miniti",
      sourceEventId: eventId,
      onboardingId,
      action,
      payload,
      sourceQuote: payload.sourceQuote ?? null,
      sourceUrl: null,
      confidence: payload.confidence ?? "medium",
    });
    draftIds.push(draft.id);
  }

  await markExternalEventProcessed(eventId);
  return { skipped: false, draftIds, callCount: result.calls.length, durationMs: result.durationMs };
}

/**
 * Build the AI orchestrator's user-message context from a Miniti meeting +
 * the matched onboarding's existing tasks/contacts/phases + vendor team.
 *
 * The orchestrator prompt expects exactly this shape — single source of
 * truth so prompt and producer don't drift.
 *
 * What we send and why:
 *   - meeting.transcript      Full concatenated transcript text. Path B: lets
 *                             Claude find action items, deadlines, and owners
 *                             that Miniti's action_items list missed.
 *   - meeting.actionItems     Miniti's pre-distilled list — kept as a strong
 *                             signal but no longer the only one.
 *   - openTasks (rich)        Now includes description + notes + blockedByTaskId
 *                             so Claude can match against full task content
 *                             and pick a sensible blockedByTaskId for a new draft.
 *   - vendorUsers             Caroline's team. Claude picks `ownerId` from this
 *                             list when a vendor team-mate is the actor.
 *   - customerContacts        Same as before — Claude picks `assigneeContactId`
 *                             when a customer-side person is the actor.
 *   - phases                  Required for picking phaseId on new tasks.
 */
export function buildOrchestratorContext({ meeting, tasks, contacts, phases, vendorUsers = [], today = new Date() }) {
  const openTasks = tasks
    .filter((t) => t.status !== "Done")
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      phaseId: t.phaseId,
      due: t.due || null,
      assigneeContactId: t.assigneeContactId ?? null,
      // Richer task grounding so Claude can match against full content
      // (description) and pick a coherent blockedByTaskId for a new draft.
      description: t.description || null,
      notes: t.notes || null,
      blockedByTaskId: t.blockedByTaskId ?? null,
    }));

  const phasesLite = phases
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ id: p.id, name: p.name, isComplete: p.isComplete }));

  const customerContacts = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email || null,
  }));

  const vendorUsersLite = (vendorUsers ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
  }));

  // Concat the full transcript into a single string. Path B unlocks owner /
  // due-date / dependency extraction Miniti's action_items list misses.
  const transcriptText = Array.isArray(meeting.transcript)
    ? meeting.transcript.map((t) => t?.text).filter(Boolean).join("\n")
    : "";

  return {
    today: today.toISOString().slice(0, 10),
    meeting: {
      id: meeting.id,
      title: meeting.title,
      date: meeting.date,
      summary: meeting.summary ?? null,
      // Miniti's pre-extracted action items — strong signal but not the
      // only one. Claude is also free to find action items in the transcript.
      actionItems: meeting.action_items ?? [],
      keyDecisions: meeting.key_decisions ?? [],
      notes: meeting.notes ?? null,
      transcript: transcriptText,
    },
    openTasks,
    phases: phasesLite,
    customerContacts,
    vendorUsers: vendorUsersLite,
  };
}
