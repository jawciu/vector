import Link from "next/link";
import { getOnboardings } from "@/lib/db";
import CompaniesActionBar from "./components/CompaniesActionBar";

const LOGO_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
];

function companyInitials(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

function companyLogoColor(name) {
  const n = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return LOGO_COLORS[n % LOGO_COLORS.length];
}

export default async function OnboardingsListPage() {
  const onboardings = await getOnboardings();

  return (
    <div className="w-full pt-3 pb-3">
      <div
        className="w-full flex flex-col justify-center items-start border-b"
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          height: 44,
          boxSizing: "border-box",
          borderColor: "var(--border)",
        }}
      >
        <h1
          className="text-base font-semibold"
          style={{ color: "var(--text)" }}
        >
          Companies
        </h1>
      </div>
      <div
        className="w-full"
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          boxSizing: "border-box",
        }}
      >
        <CompaniesActionBar />
      </div>
      <div
        className="border-b w-full"
        style={{ borderColor: "var(--border)" }}
      />
      <div
        className="mt-0 border-b w-full overflow-x-auto"
        style={{ borderColor: "var(--border)" }}
      >
        {/* Header row: full-width border, padded content */}
        <div
          className="grid grid-cols-[1.2fr_100px_1fr_120px_60px_60px_110px] gap-4 pt-3 pb-3 text-left text-sm border-b"
          style={{
            width: "100%",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <span className="font-medium">Company</span>
          <span className="font-medium">Status</span>
          <span className="font-medium">Next action</span>
          <span className="font-medium">Owner</span>
          <span className="font-medium">Tasks</span>
          <span className="font-medium">Blocked</span>
          <span className="font-medium">Last activity</span>
        </div>
        {/* Data rows: full-width border under each row, padded content */}
        {onboardings.map((ob) => (
          <div
            key={ob.id}
            className="grid grid-cols-[1.2fr_100px_1fr_120px_60px_60px_110px] gap-4 py-4 text-left text-sm border-b last:border-b-0"
            style={{
              width: "100%",
              borderColor: "var(--border-subtle)",
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <span className="flex items-center gap-2">
              <span
                className="flex shrink-0 w-4 h-4 rounded items-center justify-center text-[10px] font-semibold"
                style={{
                  background: companyLogoColor(ob.companyName),
                  color: "rgba(255,255,255,0.95)",
                }}
                aria-hidden
              >
                {companyInitials(ob.companyName)}
              </span>
              <Link
                href={`/onboardings/${ob.id}`}
                className="font-medium no-underline hover:underline"
                style={{ color: "var(--text)" }}
              >
                {ob.companyName}
              </Link>
            </span>
            <span>
              <span
                className="inline-flex h-fit rounded text-xs font-medium"
                style={{
                  paddingTop: 2,
                  paddingBottom: 2,
                  paddingLeft: 4,
                  paddingRight: 4,
                  borderRadius: 6,
                  color:
                    ob.health === "At risk"
                      ? "var(--danger)"
                      : "var(--success)",
                  borderWidth: "0.5px",
                  borderStyle: "solid",
                  borderColor:
                    ob.health === "At risk"
                      ? "var(--danger)"
                      : "var(--success)",
                }}
              >
                {ob.health}
              </span>
            </span>
            <span className="truncate" style={{ color: "var(--text)" }}>
              {ob.nextAction ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
            </span>
            <span className="truncate" style={{ color: "var(--text)" }}>
              {ob.owner ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
            </span>
            <span style={{ color: "var(--text)" }}>{ob.taskCount}</span>
            <span style={{ color: "var(--text)" }}>
              {ob.blockedCount > 0 ? (
                <span style={{ color: "var(--danger)" }}>{ob.blockedCount}</span>
              ) : (
                "—"
              )}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {ob.lastActivity
                ? new Date(ob.lastActivity).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })
                : "—"}
            </span>
          </div>
        ))}
      </div>
      {onboardings.length > 0 && (
        <div
          className="w-full"
          style={{
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16,
            boxSizing: "border-box",
          }}
        >
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {onboardings.length} {onboardings.length === 1 ? "company" : "companies"}
          </p>
        </div>
      )}
    </div>
  );
}
