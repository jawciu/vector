/**
 * [GET /api/integrations/miniti/recorder] — who records Miniti meetings.
 * [PUT /api/integrations/miniti/recorder] — set it: `{ vendorUserId: number | null }`.
 *
 * Miniti labels the person recording a call "You" and sends no attendee for
 * them. This setting says who that is, so what they promise on the call gets
 * them as owner (lib/integrations/recorder.ts). Stored in the Miniti
 * IntegrationConnection config; the row is created if there is none yet.
 *
 * Any signed-in admin or member can set it (it is a workspace preference, not
 * a permission); viewers cannot. The recorder must be a team member who can
 * own work, or null to clear it.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMinitiRecorder, getOrCreateVendorUser, getVendorUserById, setMinitiRecorder } from "@/lib/db";
import { canOwnWork } from "@/lib/integrations/recorder";

const TAG = "[PUT /api/integrations/miniti/recorder]";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const recorder = await getMinitiRecorder();
    return NextResponse.json({ recorder });
  } catch (err) {
    console.error("[GET /api/integrations/miniti/recorder]", err);
    return NextResponse.json({ error: "Couldn't load the meeting recorder" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });
  if (!canOwnWork(me.role)) {
    return NextResponse.json({ error: "Viewers can't change workspace settings" }, { status: 403 });
  }

  let body: { vendorUserId?: unknown } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("vendorUserId" in body)) {
    return NextResponse.json({ error: "vendorUserId is required (a team member's id, or null)" }, { status: 400 });
  }
  const { vendorUserId } = body;
  if (vendorUserId !== null && !(typeof vendorUserId === "number" && Number.isInteger(vendorUserId) && vendorUserId > 0)) {
    return NextResponse.json({ error: "vendorUserId must be a team member's id, or null" }, { status: 400 });
  }

  try {
    if (vendorUserId !== null) {
      const target = await getVendorUserById(vendorUserId);
      if (!target) return NextResponse.json({ error: "That team member doesn't exist" }, { status: 404 });
      if (!canOwnWork(target.role)) {
        return NextResponse.json({ error: "Viewers can't own tasks, so they can't be the recorder" }, { status: 400 });
      }
    }
    await setMinitiRecorder(vendorUserId);
    const recorder = await getMinitiRecorder();
    return NextResponse.json({ recorder });
  } catch (err) {
    console.error(TAG, err);
    return NextResponse.json({ error: "Couldn't save the meeting recorder" }, { status: 500 });
  }
}
