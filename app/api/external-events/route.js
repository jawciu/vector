/**
 * [GET /api/external-events?status=ambiguous] — list events Vector couldn't match.
 *
 * Auth: any authenticated vendor user.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAmbiguousEvents, countAmbiguousEvents } from "@/lib/db";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "ambiguous";
  if (status !== "ambiguous") {
    return NextResponse.json({ error: "Only status=ambiguous is supported today" }, { status: 400 });
  }

  const [events, count] = await Promise.all([
    listAmbiguousEvents({ source: "miniti" }),
    countAmbiguousEvents({ source: "miniti" }),
  ]);

  return NextResponse.json({ events, count });
}
