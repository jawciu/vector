import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPendingAIChanges } from "@/lib/db";
import AIDraftInbox from "@/app/components/AIDraftInbox";

export const dynamic = "force-dynamic";

/** "Vector suggests" inbox — drafts proposed by the AI orchestrator. */
export default async function AIDraftsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const drafts = await listPendingAIChanges({ status: "pending", limit: 200 });

  return (
    <div className="w-full h-full overflow-y-auto" style={{ padding: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Vector suggests
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Drafts proposed by Vector from external sources. Review, edit, or reject before they touch your board.
          </p>
        </header>

        {drafts.length === 0 ? (
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
          <AIDraftInbox initialDrafts={drafts} />
        )}
      </div>
    </div>
  );
}
