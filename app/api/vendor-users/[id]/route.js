/**
 * [DELETE /api/vendor-users/[id]] — remove a team member.
 *
 * Tasks/onboardings owned by them have `ownerId` set to NULL by Prisma's
 * onDelete: SetNull. The string `owner` field is left untouched (display
 * fallback). Caroline can reassign owners after.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteVendorUser, getOrCreateVendorUser } from "@/lib/db";

export async function DELETE(_request, { params }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only — and admins can't delete themselves either (would lock them
  // out, and the last admin removing themselves would orphan the project).
  const me = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });
  if (me.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can remove team members" },
      { status: 403 }
    );
  }
  if (me.id === id) {
    return NextResponse.json({ error: "Can't delete yourself" }, { status: 400 });
  }

  try {
    await deleteVendorUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    console.error("[DELETE /api/vendor-users/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
