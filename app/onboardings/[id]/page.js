import { Suspense } from "react";
import Link from "next/link";
import {
  getOnboarding,
  getTasksForOnboarding,
  getContactsForOnboarding,
  getPhasesForOnboarding,
  getMagicLinksForOnboarding,
  getCachedInsight,
  listVendorUsers,
  countPendingAIChanges,
  getOrCreateVendorUser,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { buildOnboardingSnapshot, hashSnapshot } from "@/lib/ai/context";
import OnboardingDetailClient from "./OnboardingDetailClient";

export default async function OnboardingDetailPage({ params }) {
  const { id } = await params;

  // Resolve calling vendor for owner-scoping the workflow count (the
  // Workflows tab badge). Page is auth-guarded by middleware; if we got
  // here without a user, treat the count as 0.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const me = user
    ? await getOrCreateVendorUser({
        authUserId: user.id,
        email: user.email,
        name: user.user_metadata?.full_name ?? user.email,
      })
    : null;

  const [onboarding, tasks, contacts, phases, magicLinks, snapshot, cachedInsight, vendorUsers, workflowCount] = await Promise.all([
    getOnboarding(id),
    getTasksForOnboarding(id),
    getContactsForOnboarding(id),
    getPhasesForOnboarding(id),
    getMagicLinksForOnboarding(id),
    buildOnboardingSnapshot(id),
    getCachedInsight("onboarding", id),
    listVendorUsers(),
    me ? countPendingAIChanges({ forVendorUserId: me.id, onboardingId: id }) : Promise.resolve(0),
  ]);

  if (!onboarding) {
    return (
      <main className="max-w-3xl">
        <p style={{ color: "var(--text-muted)" }}>Onboarding not found.</p>
        <Link href="/" className="mt-2 inline-block" style={{ color: "var(--accent)" }}>
          ← Companies
        </Link>
      </main>
    );
  }

  const contextHash = snapshot ? hashSnapshot(snapshot) : null;
  const cachedInsightSerialised = cachedInsight
    ? {
        contextHash: cachedInsight.contextHash,
        payload: cachedInsight.payload,
        generatedAt: cachedInsight.generatedAt.toISOString(),
      }
    : null;

  return (
    <Suspense>
      <OnboardingDetailClient
        onboarding={onboarding}
        tasks={tasks}
        contacts={contacts}
        phases={phases}
        magicLinks={magicLinks}
        vendorUsers={vendorUsers}
        workflowCount={workflowCount}
        insightSnapshot={snapshot}
        insightContextHash={contextHash}
        cachedInsight={cachedInsightSerialised}
      />
    </Suspense>
  );
}
