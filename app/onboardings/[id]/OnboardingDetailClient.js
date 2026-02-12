"use client";

import Link from "next/link";
import { computeHealth } from "@/lib/health";
import TaskCard from "@/app/components/TaskCard";

const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

export default function OnboardingDetailClient({ onboarding, tasks }) {
  const health = computeHealth(tasks);
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;

  const columns = STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    <main className="max-w-6xl grid gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/"
          className="text-sm transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          ← Companies
        </Link>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
          {onboarding.companyName} Onboarding
        </h1>
      </div>

      <div
        className="text-sm font-medium"
        style={{ color: health === "At risk" ? "var(--danger)" : "var(--success)" }}
      >
        Health: <strong>{health}</strong> ({blockedCount} blocked)
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map(({ status, tasks }) => (
          <div
            key={status}
            className="flex flex-col gap-3 rounded-2xl p-3 md:p-4"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                className="text-xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {status}
              </h2>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {tasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {tasks.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed px-3 py-4 text-center text-xs md:text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  No tasks in this column.
                </div>
              ) : (
                tasks.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
