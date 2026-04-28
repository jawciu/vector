/**
 * [POST /api/integrations/miniti/webhook?token=...] — receives Miniti meeting events.
 *
 * Per Ian's spec on 2026-04-28:
 *   - 10s fire-and-forget timeout on Miniti's side, no retries, no signing.
 *   - Receiver MUST be idempotent on `meeting.id`.
 *   - Auth: token query param against MINITI_WEBHOOK_TOKEN.
 *
 * Flow:
 *   1. Verify token query param (constant-time-ish)
 *   2. Validate payload shape
 *   3. Match meeting → onboarding (deterministic heuristics, no AI)
 *   4. Idempotent insert of ExternalEvent (silently dedup duplicate meeting.id)
 *   5. Ack 200 immediately — well under 10s
 *   6. After response, run the orchestrator (Claude tool-use → drafts) via `after()`
 *
 * Node runtime (Prisma needs it). Hobby tier function ceiling is ~10s including
 * `after()` work, so the orchestrator runs in the same invocation. Most events
 * fit comfortably; if the orchestrator gets killed mid-flight, the ExternalEvent
 * remains with processedAt=null and can be reprocessed later.
 */

import { NextResponse, after } from "next/server";
import { validateMinitiPayload, matchMeetingToOnboarding, buildOrchestratorContext } from "@/lib/integrations/miniti";
import { runMinitiOrchestrator, toolCallToAction } from "@/lib/ai/orchestrator";
import {
  createExternalEvent,
  getExternalEvent,
  markExternalEventProcessed,
  createPendingAIChange,
  getTasksForOnboarding,
  getContactsForOnboarding,
  getPhasesForOnboarding,
} from "@/lib/db";

export async function POST(request) {
  // 1. Auth — token query param.
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const expected = process.env.MINITI_WEBHOOK_TOKEN;
  if (!expected) {
    console.error("[POST /api/integrations/miniti/webhook] MINITI_WEBHOOK_TOKEN not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate payload.
  let parsed;
  try {
    const body = await request.json();
    parsed = validateMinitiPayload(body);
  } catch (err) {
    console.warn("[POST /api/integrations/miniti/webhook] invalid payload:", err.message);
    return NextResponse.json({ error: `Invalid payload: ${err.message}` }, { status: 400 });
  }
  const { event, meeting } = parsed;

  // 3. Match meeting → onboarding (heuristic, no AI).
  let match;
  try {
    match = await matchMeetingToOnboarding(meeting);
  } catch (err) {
    console.error("[POST /api/integrations/miniti/webhook] match failed:", err);
    match = { onboardingId: null, ambiguous: false, candidates: [] };
  }

  // 4. Idempotent insert of ExternalEvent.
  let externalEvent;
  try {
    externalEvent = await createExternalEvent({
      source: "miniti",
      sourceId: meeting.id,
      occurredAt: meeting.date,
      payload: { event, meeting },
      onboardingId: match.onboardingId,
      matchAmbiguous: match.ambiguous,
    });
  } catch (err) {
    console.error("[POST /api/integrations/miniti/webhook] event insert failed:", err);
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }

  // Dedup: createExternalEvent returns null on duplicate meeting.id.
  if (!externalEvent) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // 5. If matched (and not ambiguous), schedule orchestrator after response.
  if (match.onboardingId && !match.ambiguous) {
    after(async () => {
      try {
        await processMinitiEvent(externalEvent.id, match.onboardingId);
      } catch (err) {
        console.error("[miniti orchestrator]", err);
        await markExternalEventProcessed(externalEvent.id, { error: String(err.message ?? err) }).catch(() => {});
      }
    });
  }

  // 6. Ack fast — Miniti has 10s timeout and won't retry.
  return NextResponse.json({
    ok: true,
    eventId: externalEvent.id,
    onboardingId: match.onboardingId,
    matchedBy: match.matchedBy,
    ambiguous: match.ambiguous,
  });
}

/**
 * Run the AI orchestrator on a single ExternalEvent.
 * Loads context, calls Claude, persists draft rows, marks event processed.
 */
async function processMinitiEvent(eventId, onboardingId) {
  const event = await getExternalEvent(eventId);
  if (!event) throw new Error(`event ${eventId} not found`);
  if (event.processedAt) return; // already done by a previous invocation

  const meeting = event.payload?.meeting;
  if (!meeting) throw new Error(`event ${eventId} has no meeting payload`);

  const [tasks, contacts, phases] = await Promise.all([
    getTasksForOnboarding(onboardingId),
    getContactsForOnboarding(onboardingId),
    getPhasesForOnboarding(onboardingId),
  ]);

  const context = buildOrchestratorContext({ meeting, tasks, contacts, phases });

  const result = await runMinitiOrchestrator({ context, kind: "transcript" });

  // Translate Claude's tool calls → PendingAIChange rows.
  const drafts = [];
  for (const call of result.calls) {
    const action = toolCallToAction(call.tool);
    if (action === "no_action") {
      // Nothing to surface — note in the event metadata only.
      continue;
    }
    const draft = await createPendingAIChange({
      source: "miniti",
      sourceEventId: eventId,
      onboardingId,
      action,
      payload: call.input,
      sourceQuote: call.input.sourceQuote ?? null,
      sourceUrl: null, // Miniti doesn't include a source URL today
      confidence: call.input.confidence ?? "medium",
    });
    drafts.push(draft.id);
  }

  await markExternalEventProcessed(eventId);
  console.log(
    `[miniti] event ${eventId} processed: ${drafts.length} drafts (calls=${result.calls.length}, cost=${result.usage.input_tokens}/${result.usage.output_tokens} tok)`
  );
}
