import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPendingAIChanges, listAmbiguousEvents, getOnboardings } from "@/lib/db";
import AIDraftInbox from "@/app/components/AIDraftInbox";
import UnmatchedEvents from "@/app/components/UnmatchedEvents";

export const dynamic = "force-dynamic";

/**
 * "Vector suggests" inbox.
 *
 * Two sections:
 *   1. "Needs your input" — Miniti meetings Vector couldn't auto-match.
 *      Vendor picks an onboarding → orchestrator runs → drafts appear.
 *   2. "Suggestions" — pending drafts from already-matched events.
 */
export default async function AIDraftsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [drafts, ambiguousEvents, allOnboardings] = await Promise.all([
    listPendingAIChanges({ status: "pending", limit: 200 }),
    listAmbiguousEvents({ source: "miniti", limit: 50 }),
    getOnboardings("All"),
  ]);

  const onboardingsForPicker = allOnboardings.map((ob) => ({
    id: Number(ob.id),
    companyName: ob.companyName,
  }));

  const empty = drafts.length === 0 && ambiguousEvents.length === 0;

  return (
    <div className="w-full h-full overflow-y-auto" style={{ padding: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Vector suggests
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Drafts proposed by Vector from external sources. Review, edit, or reject before they touch your board.
          </p>
        </header>

        {empty ? (
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
              Nothing pending.
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              When Vector picks up a Miniti meeting it will queue suggestions here. Connect Miniti → Settings → Webhook URL.
            </p>
            <Link
              href="/"
              style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "var(--action)" }}
            >
              ← Back to onboardings
            </Link>
          </div>
        ) : (
          <>
            {ambiguousEvents.length > 0 && (
              <UnmatchedEvents initialEvents={ambiguousEvents} onboardings={onboardingsForPicker} />
            )}
            {drafts.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <header style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                    Suggestions
                  </h2>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {drafts.length} pending
                  </span>
                </header>
                <AIDraftInbox initialDrafts={drafts} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
