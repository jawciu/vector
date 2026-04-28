/**
 * [GET /api/ai-drafts] — list pending AI drafts for the inbox.
 *
 * Auth: any authenticated vendor user.
 * Query: ?status=pending|approved|rejected|applied (default pending), ?limit
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPendingAIChanges, countPendingAIChanges } from "@/lib/db";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  const [drafts, pendingCount] = await Promise.all([
    listPendingAIChanges({ status, limit }),
    countPendingAIChanges(),
  ]);

  return NextResponse.json({ drafts, pendingCount });
}
