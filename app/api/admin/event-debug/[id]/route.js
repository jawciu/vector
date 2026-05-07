/**
 * [GET /api/admin/event-debug/[id]] — read-only debug view of one
 * ExternalEvent row, used by the /admin/ai → Test webhook panel to poll
 * for Pass 1 + Pass 2 results after firing a fixture.
 *
 * Returns: meetingTitle, processedAt, error, orchestratorInput,
 * orchestratorExtraction, orchestratorOutput. Auth-gated to logged-in
 * vendors only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getExternalEvent } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (Number.isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const event = await getExternalEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: event.id,
    meetingTitle: event.payload?.meeting?.title ?? null,
    onboardingId: event.onboardingId,
    processedAt: event.processedAt ? event.processedAt.toISOString() : null,
    error: event.error ?? null,
    orchestratorInput: event.orchestratorInput ?? null,
    orchestratorExtraction: event.orchestratorExtraction ?? null,
    orchestratorOutput: event.orchestratorOutput ?? null,
  });
}
