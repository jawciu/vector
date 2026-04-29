/**
 * [POST /api/external-events/[id]/reprocess] — re-run the orchestrator on
 * an event that already has an onboardingId but never finished processing
 * (typically: Vercel killed the function on the original webhook hit).
 *
 * Idempotent: processMinitiEvent bails early if processedAt is already set.
 */

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getExternalEvent, markExternalEventProcessed } from "@/lib/db";
import { processMinitiEvent } from "@/lib/integrations/miniti";

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

    const event = await getExternalEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (event.processedAt) {
      return NextResponse.json({ error: "Event already processed" }, { status: 409 });
    }
    if (!event.onboardingId) {
      return NextResponse.json(
        { error: "Event has no onboarding — use the assign endpoint instead" },
        { status: 400 }
      );
    }

    after(async () => {
      try {
        await processMinitiEvent(eventId, event.onboardingId);
      } catch (err) {
        console.error(`[reprocess ${eventId}]`, err);
        await markExternalEventProcessed(eventId, { error: String(err.message ?? err) }).catch(() => {});
      }
    });

    return NextResponse.json({ ok: true, eventId });
  } catch (err) {
    console.error("[POST /api/external-events/[id]/reprocess]", err);
    return NextResponse.json({ error: err.message || "Failed to reprocess event" }, { status: 500 });
  }
}
