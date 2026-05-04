import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listAmbiguousEvents, getOnboardings } from "@/lib/db";
import UnmatchedEvents from "@/app/components/UnmatchedEvents";

export const dynamic = "force-dynamic";

/**
 * Global Workflows page — only the things that AREN'T tied to a specific
 * onboarding yet. Today that means ambiguous Miniti meetings (Vector
 * couldn't auto-match them and needs Caroline to pick the onboarding).
 *
 * Per-onboarding AI drafts (create_task / match_existing / update_status /
 * draft_followup) live on each onboarding's Workflows tab, surfaced via
 * the badge on the Onboardings table.
 */
export default async function AIDraftsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ambiguousEvents, allOnboardings] = await Promise.all([
    listAmbiguousEvents({ source: "miniti", limit: 50 }),
    getOnboardings("All"),
  ]);

  const onboardingsForPicker = allOnboardings.map((ob) => ({
    id: Number(ob.id),
    companyName: ob.companyName,
  }));

  return (
    <div className="w-full h-full overflow-y-auto" style={{ padding: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Workflows
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Things that need your input but aren&rsquo;t yet tied to a specific onboarding. Per-onboarding drafts live on each onboarding&rsquo;s Workflows tab.
          </p>
        </header>

        {ambiguousEvents.length > 0 ? (
          <UnmatchedEvents initialEvents={ambiguousEvents} onboardings={onboardingsForPicker} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "32px 20px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 14, color: "var(--text)", margin: "0 0 6px" }}>
        Nothing waiting for assignment.
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        Ambiguous Miniti meetings show up here when Vector can&rsquo;t auto-match them. Per-onboarding drafts are on the corresponding{" "}
        <Link href="/" style={{ color: "var(--action)" }}>
          Onboardings
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
