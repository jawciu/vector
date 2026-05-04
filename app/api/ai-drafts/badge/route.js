/**
 * [GET /api/ai-drafts/badge] — sidebar badge count.
 *
 * Now returns ONLY ambiguous Miniti events (meetings Vector couldn't auto-
 * match to an onboarding). Per-onboarding draft counts moved to the
 * onboardings home table after the per-onboarding Workflows tab landed.
 *
 * The sidebar `/workflows` link uses this count to indicate "you have
 * unmatched events that need manual assignment". Other AI drafts surface
 * inside their respective onboarding's Workflows tab.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countAmbiguousEvents } from "@/lib/db";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ambiguous = await countAmbiguousEvents({ source: "miniti" });
  return NextResponse.json({ count: ambiguous, ambiguous });
}
