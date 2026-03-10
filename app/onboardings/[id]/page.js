import { Suspense } from "react";
import Link from "next/link";
import { getOnboarding, getTasksForOnboarding, getContactsForOnboarding, getPhasesForOnboarding, getMagicLinksForOnboarding } from "@/lib/db";
import OnboardingDetailClient from "./OnboardingDetailClient";

export default async function OnboardingDetailPage({ params }) {
  const { id } = await params;
  const [onboarding, tasks, contacts, phases, magicLinks] = await Promise.all([
    getOnboarding(id),
    getTasksForOnboarding(id),
    getContactsForOnboarding(id),
    getPhasesForOnboarding(id),
    getMagicLinksForOnboarding(id),
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

  return (
    <Suspense>
      <OnboardingDetailClient onboarding={onboarding} tasks={tasks} contacts={contacts} phases={phases} magicLinks={magicLinks} />
    </Suspense>
  );
}
