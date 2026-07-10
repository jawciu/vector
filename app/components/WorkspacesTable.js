"use client";

import React, { useState } from "react";
import Link from "next/link";
import { avatarColor, avatarInitials } from "@/lib/avatar";
import CompanyAvatar from "@/app/ui/CompanyAvatar";
import Tooltip from "@/app/ui/Tooltip";

function statusBadge(ob) {
  if (ob.onboardingStatus === "Completed") return { label: "Completed", color: "var(--mint)", lines: null };
  if (ob.onboardingStatus === "Paused") return { label: "Paused", color: "var(--rose)", lines: null };
  const lines = ob.healthReasons?.length > 0 ? ob.healthReasons : null;
  if (ob.health === "At risk") return { label: "At risk", color: "var(--alert)", lines };
  if (ob.health === "Blocked") return { label: "Blocked", color: "var(--danger)", lines };
  return { label: "On track", color: "var(--success)", lines: null };
}

const HEADERS = ["Company", "Status", "Tasks", "Blocked", "Next action", "Last activity", "Owner", "Actions"];

export default function WorkspacesTable({ onboardings }) {
  const [hoveredRowIdx, setHoveredRowIdx] = useState(null);

  return (
    <div
      className="w-full overflow-x-auto grid text-left text-sm"
      style={{
        gridTemplateColumns: "1fr 100px 80px 80px 1.2fr 120px 140px 110px",
        borderColor: "var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {HEADERS.map((label, i) => (
        <span
          key={label}
          className="font-medium"
          style={{
            color: "var(--text-muted)",
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: i === 0 ? 20 : 12,
            paddingRight: i === 7 ? 20 : 12,
            borderBottom: "1px solid var(--border)",
            borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
          }}
        >
          {label}
        </span>
      ))}
      {onboardings.map((ob, rowIdx) => {
        const isLast = rowIdx === onboardings.length - 1;
        const isHovered = hoveredRowIdx === rowIdx;
        const cellStyle = (colIdx) => ({
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: colIdx === 0 ? 20 : 12,
          paddingRight: colIdx === 7 ? 20 : 12,
          borderBottom: isLast ? undefined : "1px solid var(--border-subtle)",
          borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
          background: isHovered ? "var(--bg-hover)" : undefined,
          transition: "background-color 0.15s ease",
          cursor: "pointer",
        });
        const actionCount = ob.actionCount;
        const badge = statusBadge(ob);
        return (
          <div
            key={ob.id}
            style={{ display: "contents" }}
            onMouseEnter={() => setHoveredRowIdx(rowIdx)}
            onMouseLeave={() => setHoveredRowIdx((idx) => (idx === rowIdx ? null : idx))}
          >
            <Link
              href={`/onboardings/${ob.id}`}
              className="flex items-center gap-2 no-underline"
              style={cellStyle(0)}
            >
              <CompanyAvatar name={ob.companyName} logoUrl={ob.companyLogoUrl} size={16} />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: isHovered ? "var(--action)" : "var(--text)", transition: "color 0.15s ease" }}
              >
                {ob.companyName}
              </span>
            </Link>
            <span className="flex items-center" style={cellStyle(1)}>
              <Tooltip lines={badge.lines}>
                <span
                  className="inline-flex h-fit rounded text-xs font-medium health-pill"
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
              </Tooltip>
            </span>
            <span className="flex items-center" style={{ ...cellStyle(2), color: "var(--text)" }}>{ob.taskCount}</span>
            <span className="flex items-center" style={{ ...cellStyle(3), color: "var(--text)" }}>
              {ob.blockedCount > 0 ? (
                <span style={{ color: "var(--danger)" }}>{ob.blockedCount}</span>
              ) : (
                "—"
              )}
            </span>
            <span className="flex items-center truncate" style={{ ...cellStyle(4), color: "var(--text)" }}>
              {ob.nextAction ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
            </span>
            <span className="flex items-center" style={{ ...cellStyle(5), color: "var(--text-muted)" }}>
              {ob.lastActivity
                ? new Date(ob.lastActivity).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </span>
            <span className="flex items-center gap-2 truncate" style={cellStyle(6)}>
              {ob.owner ? (
                <>
                  <span
                    className="flex shrink-0 w-5 h-5 rounded-full items-center justify-center text-[10px] font-semibold"
                    style={{
                      background: avatarColor(ob.owner),
                      color: "var(--text-dark)",
                    }}
                    aria-hidden
                  >
                    {avatarInitials(ob.owner)}
                  </span>
                  <span style={{ color: "var(--text)" }}>{ob.owner}</span>
                </>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>—</span>
              )}
            </span>
            <Link
              href={`/onboardings/${ob.id}?tab=actions`}
              className="flex items-center no-underline"
              style={cellStyle(7)}
              aria-label={
                actionCount > 0
                  ? `${actionCount} pending action ${actionCount === 1 ? "draft" : "drafts"}`
                  : "No pending action drafts"
              }
            >
              {actionCount > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 9999,
                    background: "var(--action)",
                    color: "var(--action-text)",
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {actionCount > 99 ? "99+" : actionCount}
                </span>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>—</span>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
