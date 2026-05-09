/**
 * [POST /api/external-events/[id]/assign] — vendor manually assigns an
 * ambiguous event to a specific onboarding, then we kick off the orchestrator.
 *
 * Body: { onboardingId: number }
 *
 * Returns: { ok, draftIds, durationMs }
 */

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assignExternalEventOnboarding, getExternalEvent, markExternalEventProcessed } from "@/lib/db";
import { processMinitiEvent } from "@/lib/integrations/miniti";

// Same budget as the Miniti webhook — the orchestrator runs in
// `after()` after the 200 ack, so the route function instance has to
// stay alive long enough for Pass 1 + Pass 2 to finish (~15-30s
// typically). Default 10s on Vercel kills the orchestrator silently
// and leaves the inline drafts panel polling forever.
export const maxDuration = 60;

export async function POST(request, { params }) {
  try {
    const { id: rawId } = await params;
    const eventId = Number(rawId);
    if (Number.isNaN(eventId)) {
      return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const onboardingId = Number(body?.onboardingId);
    if (Number.isNaN(onboardingId)) {
      return NextResponse.json({ error: "onboardingId required" }, { status: 400 });
    }

    const event = await getExternalEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (event.processedAt) {
      return NextResponse.json({ error: "Event already processed" }, { status: 409 });
    }

    // Assign first so the matchAmbiguous flag clears even if orchestrator fails.
    await assignExternalEventOnboarding(eventId, onboardingId);

    // Run orchestrator in the background — return 200 fast so the UI can
    // remove the unmatched card without waiting.
    after(async () => {
      try {
        await processMinitiEvent(eventId, onboardingId);
      } catch (err) {
        console.error(`[assign-event ${eventId}] orchestrator failed`, err);
        await markExternalEventProcessed(eventId, { error: String(err.message ?? err) }).catch(() => {});
      }
    });

    return NextResponse.json({ ok: true, eventId, onboardingId });
  } catch (err) {
    console.error("[POST /api/external-events/[id]/assign]", err);
    return NextResponse.json({ error: err.message || "Failed to assign event" }, { status: 500 });
  }
}
