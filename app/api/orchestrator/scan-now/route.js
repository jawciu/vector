/**
 * [POST /api/orchestrator/scan-now] — manual trigger for the stale-task
 * scanner, scoped to the calling vendor's tasks only.
 *
 * UI lives on /admin/ai. Drafts land in the same /ai-drafts inbox as the
 * Miniti-sourced ones, with action="draft_followup".
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateVendorUser } from "@/lib/db";
import { scanStaleTasks } from "@/lib/ai/scan-stale";

export const dynamic = "force-dynamic";
// Same generous budget as the cron entry — scanning may run several Claude
// calls back-to-back.
export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });

    const result = await scanStaleTasks({ scopeVendorId: vu.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST /api/orchestrator/scan-now]", err);
    return NextResponse.json(
      { error: err.message || "Scan failed" },
      { status: 500 }
    );
  }
}
