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
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" style={{ fontSize: 14, color: "#6b7280" }}>← Onboardings</Link>
        <h1 className="text-4xl font-bold underline">{onboarding.companyName} Onboarding</h1>
      </div>

      <div style={{ fontSize: 14, color: health === "At risk" ? "#b91c1c" : "#166534" }}>
        Health: <strong>{health}</strong> ({blockedCount} blocked)
      </div>

      <label style={{ display: "grid", gap: 6, maxWidth: 220 }}>
        <span style={{ fontSize: 13, color: "#4b5563" }}>Filter by status</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          <option>All</option>
          <option>Todo</option>
          <option>In progress</option>
          <option>Blocked</option>
          <option>Done</option>
        </select>
      </label>

      <div style={{ display: "grid", gap: 12 }}>
        {visibleTasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
      </div>
    </main>
  );
}
