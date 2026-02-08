"use client";

import Link from "next/link";
import { useState } from "react";
import { computeHealth } from "@/lib/health";
import TaskCard from "@/app/components/TaskCard";

export default function OnboardingDetailClient({ onboarding, tasks }) {
  const health = computeHealth(tasks);
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;
  const [filter, setFilter] = useState("All");
  const visibleTasks = filter === "All" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <main className="max-w-3xl grid gap-4">
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

      <label className="grid gap-1.5" style={{ maxWidth: 220 }}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Filter by status
        </span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="py-2.5 px-3 rounded-lg text-sm transition-colors"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        >
          <option>All</option>
          <option>Todo</option>
          <option>In progress</option>
          <option>Blocked</option>
          <option>Done</option>
        </select>
      </label>

      <div className="grid gap-3">
        {visibleTasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
      </div>
    </main>
  );
}
