"use client";

import Link from "next/link";
import { computeHealth } from "@/lib/health";
import TaskCard from "@/app/components/TaskCard";

const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

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

export default function OnboardingDetailClient({ onboarding, tasks }) {
  const health = computeHealth(tasks);
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;

  const columns = STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    <main className="w-full grid gap-4">
      <nav
        className="w-full flex items-center gap-2 text-sm border-b"
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          height: 44,
          borderColor: "var(--border)",
        }}
      >
        <Link
          href="/"
          className="transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          Onboardings
        </Link>
        <span style={{ color: "var(--text-muted)" }}>›</span>
        <div className="flex items-center gap-2">
          <span
            className="flex shrink-0 w-5 h-5 rounded items-center justify-center text-[10px] font-semibold"
            style={{
              background: companyLogoColor(onboarding.companyName),
              color: "var(--text-dark)",
            }}
            aria-hidden
          >
            {companyInitials(onboarding.companyName)}
          </span>
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {onboarding.companyName}
          </span>
        </div>
      </nav>
      <div className="max-w-6xl grid gap-4" style={{ paddingLeft: 16, paddingRight: 16 }}>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex rounded text-xs font-medium"
          style={{
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 8,
            paddingRight: 8,
            borderRadius: 6,
            color: health === "Blocked" || health === "At risk" ? "var(--danger)" : "var(--success)",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: health === "Blocked" || health === "At risk" ? "var(--danger)" : "var(--success)",
          }}
        >
          {health}
        </span>
        {blockedCount > 0 && (
          <span
            className="inline-flex rounded text-xs font-medium"
            style={{
              paddingTop: 4,
              paddingBottom: 4,
              paddingLeft: 8,
              paddingRight: 8,
              borderRadius: 6,
              color: "var(--danger)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: "var(--danger)",
            }}
          >
            {blockedCount} blocked
          </span>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map(({ status, tasks }) => (
          <div key={status} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <h2
                className="text-xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {status}
              </h2>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {tasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {tasks.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed px-4 py-8 text-center text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  No tasks
                </div>
              ) : (
                tasks.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>
          </div>
        ))}
      </section>
      </div>
    </main>
  );
}
