import Link from "next/link";
import { getOnboarding, getTasksForOnboarding, getContactsForOnboarding, getPhasesForOnboarding } from "@/lib/db";
import OnboardingDetailClient from "./OnboardingDetailClient";

export default async function OnboardingDetailPage({ params }) {
  const { id } = await params;
  const [onboarding, tasks, contacts, phases] = await Promise.all([
    getOnboarding(id),
    getTasksForOnboarding(id),
    getContactsForOnboarding(id),
    getPhasesForOnboarding(id),
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

  return <OnboardingDetailClient onboarding={onboarding} tasks={tasks} contacts={contacts} phases={phases} />;
}
