/**
 * [GET /api/onboardings/[id]/draft-options] — return the lookup lists
 * that the inline draft cards need (vendorUsers, contacts, phases, open
 * tasks). Used by /ai-drafts UnmatchedEvents after Assign + process so
 * we can render the new drafts inline without a navigation.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listVendorUsers,
  getContactsForOnboarding,
  getPhasesForOnboarding,
  getTasksForOnboarding,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const onboardingId = Number(id);
  if (Number.isNaN(onboardingId)) {
    return NextResponse.json({ error: "Invalid onboarding id" }, { status: 400 });
  }

  const [allVendorUsers, contacts, phases, tasks] = await Promise.all([
    listVendorUsers(),
    getContactsForOnboarding(onboardingId),
    getPhasesForOnboarding(onboardingId),
    getTasksForOnboarding(onboardingId),
  ]);

  const vendorUsers = allVendorUsers
    .filter((u) => u.role === "admin" || u.role === "member")
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return NextResponse.json({
    vendorUsers,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email })),
    phases: phases.map((p) => ({ id: p.id, name: p.name, isComplete: p.isComplete })),
    openTasks: tasks
      .filter((t) => t.status !== "Done")
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        phaseId: t.phaseId,
      })),
  });
}
