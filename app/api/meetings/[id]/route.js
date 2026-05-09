/**
 * [GET /api/meetings/[id]] — read one meeting (ExternalEvent) for the
 * MeetingDrawer. Returns title, date, attendees, summary, transcript.
 *
 * Auth-gated to logged-in vendors only. We don't scope further by
 * onboarding membership because vendors share full access today; if
 * that changes, gate by onboarding here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMeetingByEventId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const meeting = await getMeetingByEventId(id);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  return NextResponse.json(meeting);
}
