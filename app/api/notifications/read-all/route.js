import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateVendorUser, markAllNotificationsRead } from "@/lib/db";

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

    const updated = await markAllNotificationsRead(vu.id);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error("[POST /api/notifications/read-all]", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark notifications read" },
      { status: 500 }
    );
  }
}
