/**
 * [GET /api/ai-drafts] — list pending AI drafts for the inbox.
 *
 * Auth: any authenticated vendor user.
 * Query: ?status=pending|approved|rejected|applied (default pending), ?limit
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPendingAIChanges, countPendingAIChanges, getOrCreateVendorUser } from "@/lib/db";

export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);
  const onboardingIdRaw = searchParams.get("onboardingId");
  const onboardingId = onboardingIdRaw != null ? Number(onboardingIdRaw) : null;
  if (onboardingIdRaw != null && Number.isNaN(onboardingId)) {
    return NextResponse.json({ error: "Invalid onboardingId" }, { status: 400 });
  }

  const [drafts, pendingCount] = await Promise.all([
    listPendingAIChanges({ status, limit, forVendorUserId: vu.id, onboardingId }),
    countPendingAIChanges({ forVendorUserId: vu.id, onboardingId }),
  ]);

  return NextResponse.json({ drafts, pendingCount });
}
