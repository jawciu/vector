"use client";

import PortalUpdatesBanner from "./PortalUpdatesBanner";

const STATUS_COLORS = {
  done: "var(--success)",
  inProgress: "var(--action)",
  blocked: "var(--danger)",
  notStarted: "var(--text-muted)",
};

function GoLiveCountdown({ targetGoLive }) {
  if (!targetGoLive) return null;

  const now = new Date();
  const goLive = new Date(targetGoLive);
  const diffMs = goLive - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return (
      <div
        className="rounded-lg h-full"
        style={{
          padding: "12px 16px",
          background: "rgba(255, 137, 155, 0.08)",
          border: "1px solid var(--danger)",
        }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--danger)" }}>
          Go-live was {Math.abs(days)} day{Math.abs(days) !== 1 ? "s" : ""} ago
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg h-full"
      style={{
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--text-muted)", marginBottom: 4 }}>
        Go-live target
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
          {days}
        </span>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          day{days !== 1 ? "s" : ""} remaining
        </span>
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {goLive.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

function HealthBanner({ health }) {
  if (health.status === "On track") {
    return (
      <div
        className="rounded-lg h-full"
        style={{
          padding: "12px 16px",
          background: "rgba(156, 255, 166, 0.08)",
          border: "1px solid var(--success)",
        }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
          On track
        </span>
      </div>
    );
  }

  const color = health.status === "Blocked" ? "var(--danger)" : "var(--alert)";
  const bgAlpha = health.status === "Blocked" ? "rgba(255, 137, 155, 0.08)" : "rgba(255, 218, 145, 0.08)";

  return (
    <div
      className="rounded-lg h-full"
      style={{
        padding: "12px 16px",
        background: bgAlpha,
        border: `1px solid ${color}`,
      }}
    >
      <span className="text-sm font-medium" style={{ color }}>
        {health.status}
      </span>
      {health.reasons.length > 0 && (
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {health.reasons.join(" · ")}
        </div>
      )}
    </div>
  );
}

function TaskSummary({ summary }) {
  const items = [
    { label: "To do", count: summary.notStarted, color: STATUS_COLORS.notStarted },
    { label: "In progress", count: summary.inProgress, color: STATUS_COLORS.inProgress },
    { label: "Blocked", count: summary.blocked, color: STATUS_COLORS.blocked },
    { label: "Done", count: summary.done, color: STATUS_COLORS.done },
  ];

  return (
    <div
      className="rounded-lg"
      style={{
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Task summary
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map(({ label, count, color }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-semibold" style={{ color }}>
              {count}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentedBar({ statusCounts }) {
  const total = statusCounts.total;
  if (total === 0) return null;

  const segments = [
    { key: "done", count: statusCounts.done, color: STATUS_COLORS.done },
    { key: "inProgress", count: statusCounts.inProgress, color: STATUS_COLORS.inProgress },
    { key: "blocked", count: statusCounts.blocked, color: STATUS_COLORS.blocked },
    { key: "notStarted", count: statusCounts.notStarted, color: STATUS_COLORS.notStarted },
  ].filter((s) => s.count > 0);

  return (
    <div className="flex rounded-full overflow-hidden" style={{ height: 6, background: "var(--bg)" }}>
      {segments.map(({ key, count, color }) => (
        <div
          key={key}
          style={{
            width: `${(count / total) * 100}%`,
            background: color,
            minWidth: 3,
          }}
        />
      ))}
    </div>
  );
}

function PhaseCard({ phase }) {
  const { statusCounts } = phase;

  return (
    <div
      className="rounded-lg"
      style={{
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {phase.name}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {statusCounts.done}/{statusCounts.total} done
        </span>
      </div>
      <SegmentedBar statusCounts={statusCounts} />
    </div>
  );
}

export default function PortalOverview({ data }) {
  return (
    <div className="flex flex-col gap-3">
      <PortalUpdatesBanner />

      {/* Health + Go-live: side by side on desktop */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="md:flex-1">
          <HealthBanner health={data.health} />
        </div>
        {data.targetGoLive && (
          <div className="md:flex-1">
            <GoLiveCountdown targetGoLive={data.targetGoLive} />
          </div>
        )}
      </div>

      <TaskSummary summary={data.taskSummary} />

      {/* Phases — 2-col grid on desktop */}
      <div>
        <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
          Phases
        </div>
        <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
          {data.phases.map((phase) => (
            <PhaseCard key={phase.id} phase={phase} />
          ))}
        </div>
      </div>
    </div>
  );
}
