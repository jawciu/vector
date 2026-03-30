import { NextResponse } from "next/server";
import { revokeMagicLink } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { linkId } = await params;
    const link = await revokeMagicLink(linkId);
    if (!link) {
      return NextResponse.json({ error: "Magic link not found" }, { status: 404 });
    }
    return NextResponse.json(link);
  } catch (error) {
    console.error("[PATCH /api/onboardings/:id/magic-links/:linkId]", error);
    return NextResponse.json(
      { error: error.message || "Failed to revoke magic link" },
      { status: 500 }
    );
  }
}
