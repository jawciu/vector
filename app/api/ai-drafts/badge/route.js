/**
 * [GET /api/ai-drafts/badge] — single number for the sidebar count badge.
 *
 * Returns { count } where count = pending drafts + ambiguous Miniti events.
 * Cheap (two count queries, no joins). Safe to poll every ~30s from the
 * sidebar without straining the DB.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countPendingAIChanges, countAmbiguousEvents, getOrCreateVendorUser } from "@/lib/db";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vu = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });

  const [pending, ambiguous] = await Promise.all([
    countPendingAIChanges({ forVendorUserId: vu.id }),
    countAmbiguousEvents({ source: "miniti" }),
  ]);

  return NextResponse.json({ count: pending + ambiguous, pending, ambiguous });
}
