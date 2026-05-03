import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPendingAIChanges, listAmbiguousEvents, getOnboardings, getOrCreateVendorUser } from "@/lib/db";
import AIDraftInbox from "@/app/components/AIDraftInbox";
import UnmatchedEvents from "@/app/components/UnmatchedEvents";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "applied", "rejected"];

/**
 * "Vector suggests" inbox.
 *
 * Three sections:
 *   1. Status tabs — Pending / Applied / Rejected (pending = default)
 *   2. "Needs your input" — Miniti meetings Vector couldn't auto-match.
 *      Only shown on the Pending tab.
 *   3. "Suggestions" — drafts at the chosen status.
 */
export default async function AIDraftsPage({ searchParams }) {
  const params = await searchParams;
  const rawStatus = params?.status || "pending";
  const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : "pending";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve the vendor user so we can scope follow-up drafts to their tasks.
  const vu = await getOrCreateVendorUser({
    authUserId: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });

  const [drafts, ambiguousEvents, allOnboardings] = await Promise.all([
    listPendingAIChanges({ status, limit: 200, forVendorUserId: vu.id }),
    status === "pending"
      ? listAmbiguousEvents({ source: "miniti", limit: 50 })
      : Promise.resolve([]),
    getOnboardings("All"),
  ]);

  const onboardingsForPicker = allOnboardings.map((ob) => ({
    id: Number(ob.id),
    companyName: ob.companyName,
  }));

  const empty = drafts.length === 0 && ambiguousEvents.length === 0;

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

        <StatusTabs current={status} />

        {empty ? (
          <EmptyState status={status} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {ambiguousEvents.length > 0 && (
              <UnmatchedEvents initialEvents={ambiguousEvents} onboardings={onboardingsForPicker} />
            )}
            {drafts.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <header style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                    {labelForStatus(status)}
                  </h2>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {drafts.length} {countNoun(status, drafts.length)}
                  </span>
                </header>
                <AIDraftInbox initialDrafts={drafts} mode={status} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTabs({ current }) {
  return (
    <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
      {VALID_STATUSES.map((s) => {
        const isActive = current === s;
        const href = s === "pending" ? "/ai-drafts" : `/ai-drafts?status=${s}`;
        return (
          <Link
            key={s}
            href={href}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 12px",
              color: isActive ? "var(--text)" : "var(--text-muted)",
              borderBottom: `2px solid ${isActive ? "var(--action)" : "transparent"}`,
              marginBottom: -1,
              textDecoration: "none",
              textTransform: "capitalize",
            }}
          >
            {s}
          </Link>
        );
      })}
    </nav>
  );
}

function EmptyState({ status }) {
  const messages = {
    pending: {
      title: "Nothing pending.",
      sub: "When Vector picks up a Miniti meeting it will queue suggestions here. Connect Miniti → Settings → Webhook URL.",
    },
    applied: {
      title: "No applied drafts yet.",
      sub: "Drafts you approve will show up here as a record of what Vector helped with.",
    },
    rejected: {
      title: "No rejected drafts yet.",
      sub: "Drafts you reject will be kept here — useful later for tuning Vector's prompts.",
    },
  };
  const m = messages[status] ?? messages.pending;
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
      <p style={{ fontSize: 14, color: "var(--text)", margin: "0 0 6px" }}>{m.title}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{m.sub}</p>
      <Link
        href="/"
        style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "var(--action)" }}
      >
        ← Back to onboardings
      </Link>
    </div>
  );
}

function labelForStatus(status) {
  if (status === "pending") return "Suggestions";
  if (status === "applied") return "Applied";
  if (status === "rejected") return "Rejected";
  return "Drafts";
}

function countNoun(status, n) {
  if (status === "pending") return `pending`;
  if (status === "applied") return n === 1 ? "draft" : "drafts";
  if (status === "rejected") return n === 1 ? "draft" : "drafts";
  return "";
}
