"use client";

import InlineProse from "./InlineProse";
import TaskCardView from "../components/TaskCardView";
import { PriorityIcon, RefreshIcon, TrendArrowIcon } from "./Icons";
import Sparkle from "./Sparkle";
import IconButton from "./IconButton";
import { normaliseTrend } from "@/lib/insight-trend";

/**
 * Insight card primitives — extracted from `InsightsPanel` so the customer
 * portal can render the same visual language as the vendor onboarding view.
 *
 * The pieces are presentational; the streaming + payload state machine
 * stays with the consumer (vendor `InsightsPanel`, customer `PortalInsightCard`).
 *
 * `InsightStatusPill` states a TREND for the vendor audience: an arrow plus
 * "improving" / "steady" / "declining", in the same three health colours.
 * Health itself is a separate, computed signal (`lib/health.js`) and never
 * appears here.
 */

export function InsightCard({ isStreaming, children, style }) {
  return (
    <div className={`oi-card${isStreaming ? " is-streaming" : ""}`} style={style}>
      {children}
    </div>
  );
}

export function InsightCardHeader({ title, healthPill, statusPill, isStreaming, payload, onRegenerate }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SparkleIcon />
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.6px",
                textTransform: "uppercase",
                color: "var(--text)",
                lineHeight: "16.5px",
              }}
            >
              {title}
            </span>
          </div>
          {/* Health (outlined, computed) sits beside the trend (filled, AI)
              so the two signals read as two things, not one. Layout is a
              class, not an inline style, to keep this header on one style
              block.

              While streaming, the trend pill is HIDDEN and "regenerating…"
              stands in its place: the pill would otherwise show the previous
              answer, which reads as the new one. Health is computed, not
              generated, so it stays put and the header never collapses. */}
          {healthPill || (statusPill && !isStreaming) ? (
            <span className="oi-header-pills">
              {healthPill}
              {isStreaming ? null : statusPill}
            </span>
          ) : null}
          {isStreaming && payload && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              regenerating…
            </span>
          )}
        </div>
        {onRegenerate && (
          <IconButton
            aria-label="Regenerate insight"
            title="Regenerate insight"
            onClick={onRegenerate}
            disabled={isStreaming}
            aria-busy={isStreaming || undefined}
          >
            <RefreshIcon />
          </IconButton>
        )}
      </div>
      <InsightDivider />
    </>
  );
}

export function InsightDivider() {
  return (
    <hr
      style={{
        height: 1,
        width: "100%",
        border: 0,
        background: "var(--border-subtle)",
        margin: 0,
      }}
    />
  );
}

export function InsightSection({ title, className, children }) {
  return (
    <div className={className}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.5px",
            color: "var(--text-muted)",
            lineHeight: "16.5px",
          }}
        >
          {title}
        </span>
        <div role="separator" aria-hidden="true" className="ai-divider" />
      </div>
      {children}
    </div>
  );
}

/**
 * Vendor pills state a TREND, keyed by the lower-case values in
 * `lib/insight-trend.js`. Health lives in `lib/health.js` and is rendered
 * elsewhere, so nothing here may borrow its words.
 *
 * The colours are deliberately the SAME three the health pill uses
 * (`WorkspacesTable`): green / amber / red read as good, watch, bad, and a
 * second ramp for the same ideas looked wrong next to them. The ARROW is what
 * separates a trend pill from a health pill, so it always renders.
 */
const VENDOR_STATUS_COLORS = {
  improving: "var(--success)",
  steady: "var(--alert)",
  declining: "var(--danger)",
};

const CUSTOMER_STATUS_COLORS = {
  "On track": "var(--success)",
  "Needs your input": "var(--alert)",
  "In progress": "var(--mint)",
};

export function InsightStatusPill({ status, audience = "vendor" }) {
  if (!status) return null;
  // Customer pills keep their own vocabulary; vendor pills are trends, and
  // insights cached before the rename still hold the old capitalised words.
  const isCustomer = audience === "customer";
  const trend = isCustomer ? null : normaliseTrend(status);
  const bg = isCustomer
    ? CUSTOMER_STATUS_COLORS[status] ?? "var(--text-muted)"
    : VENDOR_STATUS_COLORS[trend] ?? "var(--text-muted)";
  // "Trend:" is carried by hidden text, not ink: the arrow says the direction
  // and the word names it, but a screen reader still needs to hear which
  // signal this is, since the pill sits beside health pills that read alike.
  // Layout lives in globals.css (`--insight` / `--trend`) so the pill keeps a
  // single inline style block.
  return (
    <span
      className={`status-pill status-pill--filled status-pill--${trend ? "trend" : "insight"}`}
      style={{ background: bg, fontSize: 14, lineHeight: "20px", fontWeight: 400 }}
    >
      {trend ? <TrendArrowIcon direction={trend} /> : null}
      {trend ? <span className="sr-only">Trend: </span> : null}
      {trend ?? status}
    </span>
  );
}

export function RiskCard({ severity, summary, position }) {
  const radius = {
    left: { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
    middle: {},
    right: { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
    only: { borderRadius: 12 },
  }[position];

  const sevColor =
    severity === "high"
      ? "var(--danger)"
      : severity === "medium"
      ? "var(--alert)"
      : "var(--text-muted)";
  const sevLabel = severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 180,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border)",
        marginRight: position === "right" || position === "only" ? 0 : -1,
        ...radius,
      }}
    >
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <span className="status-pill" style={{ color: sevColor, fontSize: 14, lineHeight: "20px", fontWeight: 400, display: "inline" }}>
          {sevLabel}
        </span>
      </div>
      <div style={{ padding: "8px 12px 16px" }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "18px", color: "var(--text)" }}>
          <InlineProse text={summary} />
        </p>
      </div>
    </div>
  );
}

export function WinRow({ headline, detail, position }) {
  const radius =
    position === "top"
      ? { borderTopLeftRadius: 12, borderTopRightRadius: 12 }
      : position === "only"
      ? { borderRadius: 12 }
      : { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 };
  const borderTop = position === "top" || position === "only" ? "1px solid var(--border)" : "none";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 12px",
        flex: "1 1 0",
        borderTop,
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        ...radius,
      }}
    >
      <CheckCircle />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: "20px", color: "var(--text)" }}>
        {headline}{" "}
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{detail}</span>
      </p>
    </div>
  );
}

export function FocusTodayItem({ index, reason, task, onTaskClick }) {
  return (
    <div
      style={{
        flex: "1 1 240px",
        minWidth: 240,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "0 8px" }}>
        <span style={{ fontSize: 20, color: "var(--text)", lineHeight: 1, flexShrink: 0 }}>
          #{index}
        </span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "18px", color: "var(--text)" }}>
          <InlineProse text={reason} />
        </p>
      </div>
      {task ? (
        <TaskCardView task={task} onCardClick={onTaskClick} />
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            border: "1px dashed var(--border)",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          Task unavailable
        </div>
      )}
    </div>
  );
}

export function ThisWeekRow({ summary, priority, position }) {
  const radius = {
    only: { borderRadius: 12 },
    top: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
    middle: {},
    bottom: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  }[position];
  const borderTop = position === "top" || position === "only" ? "1px solid var(--border)" : "none";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "12px",
        borderTop,
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        ...radius,
      }}
    >
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <PriorityIcon priority={priority} size={16} />
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: "20px", color: "var(--text)" }}>
        <InlineProse text={summary} />
      </p>
    </div>
  );
}

export function CheckCircle() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ marginTop: 2, flexShrink: 0 }}
    >
      <path
        d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
        fill="var(--success)"
      />
    </svg>
  );
}

export function SparkleIcon() {
  return <Sparkle size={16} />;
}

export function EmptyMessage({ children }) {
  return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{children}</p>;
}

/** Position helper for horizontal card rows (left/middle/right/only). */
export function cardPosition(index, total) {
  if (total === 1) return "only";
  if (index === 0) return "left";
  if (index === total - 1) return "right";
  return "middle";
}
