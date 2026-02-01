import Link from "next/link";
import { getOnboarding, getTasksForOnboarding } from "@/lib/db";
import OnboardingDetailClient from "./OnboardingDetailClient";

export default async function OnboardingDetailPage({ params }) {
  const id = params?.id;
  const [onboarding, tasks] = await Promise.all([
    getOnboarding(id),
    getTasksForOnboarding(id),
  ]);

  if (!onboarding) {
    return (
      <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
        <p>Onboarding not found.</p>
        <Link href="/" style={{ color: "#2563eb" }}>Back to list</Link>
      </main>
    );
  }

  return <OnboardingDetailClient onboarding={onboarding} tasks={tasks} />;
}
