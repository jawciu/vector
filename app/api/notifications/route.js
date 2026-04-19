import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNotificationsForVendor, getOrCreateVendorUser } from "@/lib/db";

export async function GET() {
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

    const data = await getNotificationsForVendor(vu.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/notifications]", error);
    return NextResponse.json(
      { error: error.message || "Failed to load notifications" },
      { status: 500 }
    );
  }
}
