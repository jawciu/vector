import { Suspense } from "react";
import Link from "next/link";
import {
  getOnboarding,
  getTasksForOnboarding,
  getContactsForOnboarding,
  getPhasesForOnboarding,
  getMagicLinksForOnboarding,
  getCachedInsight,
} from "@/lib/db";
import { buildOnboardingSnapshot, hashSnapshot } from "@/lib/ai/context";
import OnboardingDetailClient from "./OnboardingDetailClient";

export default async function OnboardingDetailPage({ params }) {
  const { id } = await params;
  const [onboarding, tasks, contacts, phases, magicLinks, snapshot, cachedInsight] = await Promise.all([
    getOnboarding(id),
    getTasksForOnboarding(id),
    getContactsForOnboarding(id),
    getPhasesForOnboarding(id),
    getMagicLinksForOnboarding(id),
    buildOnboardingSnapshot(id),
    getCachedInsight("onboarding", id),
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
        insightSnapshot={snapshot}
        insightContextHash={contextHash}
        cachedInsight={cachedInsightSerialised}
      />
    </Suspense>
  );
}
