/**
 * [POST /api/external-events/reprocess-all-stuck] — bulk-reprocess every
 * Miniti event that's currently stuck (matched onboarding, no processedAt,
 * no error, older than the stuck cutoff).
 *
 * Each reprocess runs idempotently via processMinitiEvent — if Vercel
 * killed the original orchestrator mid-run, prompt caching usually means
 * the retry finishes within the 10s window.
 *
 * Returns {scheduled: N} immediately; orchestrators run in the background
 * via after().
 */

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listStuckEvents, markExternalEventProcessed } from "@/lib/db";
import { processMinitiEvent } from "@/lib/integrations/miniti";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const stuck = await listStuckEvents({ source: "miniti", limit: 50 });
    if (stuck.length === 0) {
      return NextResponse.json({ scheduled: 0 });
    }

    after(async () => {
      // Sequential — running 50 Claude calls in parallel would blow our
      // rate limit and the 10s ceiling. One at a time keeps it sane.
      for (const event of stuck) {
        try {
          await processMinitiEvent(event.id, event.onboardingId);
        } catch (err) {
          console.error(`[reprocess-all ${event.id}]`, err);
          await markExternalEventProcessed(event.id, { error: String(err.message ?? err) }).catch(() => {});
        }
      }
    });

    return NextResponse.json({ scheduled: stuck.length });
  } catch (err) {
    console.error("[POST /api/external-events/reprocess-all-stuck]", err);
    return NextResponse.json(
      { error: err.message || "Failed to schedule reprocess" },
      { status: 500 }
    );
  }
}
