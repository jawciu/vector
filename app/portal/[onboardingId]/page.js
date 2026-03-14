import { redirect } from "next/navigation";
import { validatePortalWithReason } from "@/lib/portal-auth";
import { getPortalOnboarding, getPortalTasks } from "@/lib/db";
import PortalShell from "./PortalShell";

export default async function PortalPage({ params }) {
  const { onboardingId } = await params;
  const { session, error } = await validatePortalWithReason(onboardingId);

  if (!session) {
    redirect(`/portal/auth?error=${error}`);
  }

  const [data, tasks] = await Promise.all([
    getPortalOnboarding(onboardingId),
    getPortalTasks(onboardingId, session.contact.id),
  ]);

  if (!data) {
    return (
      <main style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
        <p>Onboarding not found.</p>
      </main>
    );
  }

  return (
    <PortalShell
      data={data}
      tasks={tasks}
      contactName={session.contact.name}
    />
  );
}
