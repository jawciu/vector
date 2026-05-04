/**
 * [GET /api/vendor-users] — list team members (Vector team).
 * [POST /api/vendor-users] — invite a team member by name + email. Admin-only.
 *
 * Used by the Owner picker on tasks and the Team section in /settings. Note
 * that POST does NOT create a Supabase auth account; the new member can sign
 * up later with the same email and `getOrCreateVendorUser` will link them.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVendorUsers, createVendorUser, getOrCreateVendorUser } from "@/lib/db";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await listVendorUsers();
  return NextResponse.json({ users });
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only — non-admins can't invite teammates.
  const me = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });
  if (me.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can invite team members" },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, role } = body ?? {};
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  try {
    const created = await createVendorUser({ name, email, role });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "A team member with that email already exists" }, { status: 409 });
    }
    console.error("[POST /api/vendor-users]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
