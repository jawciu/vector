import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateVendorUser, markNotificationGroupRead } from "@/lib/db";

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupKey } = await params;
    if (!groupKey) {
      return NextResponse.json({ error: "groupKey required" }, { status: 400 });
    }

    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });

    const updated = await markNotificationGroupRead(decodeURIComponent(groupKey), vu.id);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error("[POST /api/notifications/group/:groupKey/read]", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark group read" },
      { status: 500 }
    );
  }
}
