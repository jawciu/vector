import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { getPortalActivitySinceLastSeen } from "@/lib/db";

export async function GET() {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getPortalActivitySinceLastSeen(
      session.contact.id,
      session.magicLink.onboardingId
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/portal/activity]", error);
    return NextResponse.json(
      { error: error.message || "Failed to load activity" },
      { status: 500 }
    );
  }
}
