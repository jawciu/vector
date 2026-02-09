import React from "react";
import Link from "next/link";
import { getOnboardings } from "@/lib/db";
import OnboardingsActionBar from "./components/OnboardingsActionBar";

const AVATAR_COLORS = [
  "var(--sunset)",
  "var(--lilac)",
  "var(--sky)",
  "var(--candy)",
  "var(--mint)",
  "var(--rose)",
  "var(--alert)",
  "var(--success)",
];

function companyInitials(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

function companyLogoColor(name) {
  const n = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

/** Returns { label, color } for the status badge.
 *  Active onboardings show health (On track / At risk / Blocked).
 *  Completed and Paused show their own status. */
function statusBadge(ob) {
  if (ob.onboardingStatus === "Completed") return { label: "Completed", color: "var(--mint)" };
  if (ob.onboardingStatus === "Paused") return { label: "Paused", color: "var(--rose)" };
  // Active — derive from health
  if (ob.health === "At risk") return { label: "At risk", color: "var(--alert)" };
  if (ob.health === "Blocked") return { label: "Blocked", color: "var(--danger)" };
  return { label: "On track", color: "var(--success)" };
}

export default async function OnboardingsListPage({ searchParams }) {
  const params = await searchParams;
  const statusFilter = params?.status || "Active";
  const onboardings = await getOnboardings(statusFilter);

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
          Onboardings
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
        <OnboardingsActionBar />
      </div>
      <div
        className="border-b w-full"
        style={{ borderColor: "var(--border)" }}
      />
      <div
        className="w-full overflow-x-auto grid text-left text-sm"
        style={{
          gridTemplateColumns: "1fr 100px 80px 80px 1.2fr 120px 140px",
          borderColor: "var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Header cells */}
        {["Company", "Status", "Tasks", "Blocked", "Next action", "Last activity", "Owner"].map(
          (label, i) => (
            <span
              key={label}
              className="font-medium"
              style={{
                color: "var(--text-muted)",
                paddingTop: 12,
                paddingBottom: 12,
                paddingLeft: i === 0 ? 20 : 12,
                paddingRight: i === 6 ? 20 : 12,
                borderBottom: "1px solid var(--border)",
                borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              {label}
            </span>
          )
        )}
        {/* Data rows */}
        {onboardings.map((ob, rowIdx) => {
          const isLast = rowIdx === onboardings.length - 1;
          const cellStyle = (colIdx) => ({
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: colIdx === 0 ? 20 : 12,
            paddingRight: colIdx === 6 ? 20 : 12,
            borderBottom: isLast ? undefined : "1px solid var(--border-subtle)",
            borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
          });
          return (
            <React.Fragment key={ob.id}>
              {/* Company */}
              <span className="flex items-center gap-2" style={cellStyle(0)}>
                <span
                  className="flex shrink-0 w-4 h-4 rounded items-center justify-center text-[10px] font-semibold"
                  style={{
                    background: companyLogoColor(ob.companyName),
                    color: "var(--text-dark)",
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
              {/* Status */}
              <span className="flex items-center" style={cellStyle(1)}>
                {(() => {
                  const badge = statusBadge(ob);
                  return (
                    <span
                      className="inline-flex h-fit rounded text-xs font-medium"
                      style={{
                        paddingTop: 2,
                        paddingBottom: 2,
                        paddingLeft: 4,
                        paddingRight: 4,
                        borderRadius: 6,
                        color: badge.color,
                        borderWidth: "0.5px",
                        borderStyle: "solid",
                        borderColor: badge.color,
                      }}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </span>
              {/* Tasks */}
              <span className="flex items-center" style={{ ...cellStyle(2), color: "var(--text)" }}>{ob.taskCount}</span>
              {/* Blocked */}
              <span className="flex items-center" style={{ ...cellStyle(3), color: "var(--text)" }}>
                {ob.blockedCount > 0 ? (
                  <span style={{ color: "var(--danger)" }}>{ob.blockedCount}</span>
                ) : (
                  "—"
                )}
              </span>
              {/* Next action */}
              <span className="flex items-center truncate" style={{ ...cellStyle(4), color: "var(--text)" }}>
                {ob.nextAction ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
              </span>
              {/* Last activity */}
              <span className="flex items-center" style={{ ...cellStyle(5), color: "var(--text-muted)" }}>
                {ob.lastActivity
                  ? new Date(ob.lastActivity).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </span>
              {/* Owner */}
              <span className="flex items-center gap-2 truncate" style={cellStyle(6)}>
                {ob.owner ? (
                  <>
                    <span
                      className="flex shrink-0 w-5 h-5 rounded-full items-center justify-center text-[10px] font-semibold"
                      style={{
                        background: companyLogoColor(ob.owner),
                        color: "var(--text-dark)",
                      }}
                      aria-hidden
                    >
                      {companyInitials(ob.owner)}
                    </span>
                    <span style={{ color: "var(--text)" }}>{ob.owner}</span>
                  </>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>—</span>
                )}
              </span>
            </React.Fragment>
          );
        })}
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
            {onboardings.length} {onboardings.length === 1 ? "onboarding" : "onboardings"}
          </p>
        </div>
      )}
    </div>
  );
}
