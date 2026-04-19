import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { markPortalSeen } from "@/lib/db";

export async function POST() {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await markPortalSeen(session.contact.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/portal/activity/seen]", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark seen" },
      { status: 500 }
    );
  }
}
