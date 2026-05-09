import { redirect } from "next/navigation";
import { validatePortalWithReason } from "@/lib/portal-auth";
import { getPortalOnboarding, getPortalTasks, getCachedInsight } from "@/lib/db";
import { buildOnboardingSnapshot, hashSnapshot } from "@/lib/ai/context";
import PortalShell from "./PortalShell";

export default async function PortalPage({ params }) {
  const { onboardingId } = await params;
  const { session, error } = await validatePortalWithReason(onboardingId);

  if (!session) {
    redirect(`/portal/auth?error=${error}`);
  }

  const [data, tasks, snapshot, cachedInsight] = await Promise.all([
    getPortalOnboarding(onboardingId),
    getPortalTasks(onboardingId, session.contact.id),
    buildOnboardingSnapshot(onboardingId),
    getCachedInsight("portal", onboardingId),
  ]);

  if (!data) {
    return (
      <main style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
        <p>Onboarding not found.</p>
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
    <PortalShell
      data={data}
      tasks={tasks}
      contactName={session.contact.name}
      contactId={session.contact.id}
      insightSnapshot={snapshot}
      insightContextHash={contextHash}
      cachedInsight={cachedInsightSerialised}
    />
  );
}
