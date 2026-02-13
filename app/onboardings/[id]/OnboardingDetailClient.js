"use client";

import { useState } from "react";
import Link from "next/link";
import { computeHealth } from "@/lib/health";
import TaskCard from "@/app/components/TaskCard";
import CreateTaskCard from "@/app/components/CreateTaskCard";

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

export default function OnboardingDetailClient({ onboarding, tasks: initialTasks }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState("");

  const health = computeHealth(tasks);
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;

  const columns = STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  function handleTaskCreated(newTask) {
    setTasks(prevTasks => [...prevTasks, newTask]);
  }

  function handleTaskUpdated(updatedTask) {
    setTasks(prevTasks =>
      prevTasks.map(t => t.id === updatedTask.id ? updatedTask : t)
    );
  }

  function handleTaskDeleted(taskId) {
    setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
  }

  return (
    <main className="w-full flex flex-col" style={{ minHeight: "100vh" }}>
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
      <div className="max-w-6xl" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 }}>
        <div className="flex flex-col gap-2">
          {error && (
            <div
              className="text-sm px-3 py-2 rounded"
              style={{
                color: "var(--danger)",
                background: "rgba(255, 137, 155, 0.1)",
                border: "1px solid var(--danger)",
              }}
            >
              {error}
            </div>
          )}
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
        </div>
      </div>

      <section className="flex-1 flex flex-col" style={{ borderTop: "1px solid var(--border)" }}>
        {/* Header row */}
        <div className="grid md:grid-cols-2 xl:grid-cols-5" style={{ borderBottom: "1px solid var(--border)" }}>
          {columns.map(({ status, tasks }, colIdx) => (
            <div
              key={status}
              className="flex items-center gap-2"
              style={{
                paddingTop: 12,
                paddingBottom: 12,
                paddingLeft: 16,
                paddingRight: 16,
                borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              <h2
                className="text-base font-bold"
                style={{ color: "var(--text)" }}
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
          ))}
          {/* Add section header */}
          <div
            className="flex items-center gap-2"
            style={{
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 16,
              paddingRight: 16,
              borderLeft: "1px solid var(--border)",
            }}
          >
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text)" }}
            >
              + Add section
            </h2>
          </div>
        </div>

        {/* Content row */}
        <div className="grid md:grid-cols-2 xl:grid-cols-5 flex-1">
          {columns.map(({ status, tasks }, colIdx) => (
            <div
              key={status}
              className="flex flex-col gap-3"
              style={{
                paddingTop: 16,
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 16,
                borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              {tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onTaskUpdated={handleTaskUpdated}
                  onTaskDeleted={handleTaskDeleted}
                />
              ))}
              <CreateTaskCard
                onboardingId={onboarding.id}
                defaultStatus={status}
                onTaskCreated={handleTaskCreated}
              />
            </div>
          ))}
          {/* Add section content */}
          <div
            className="flex flex-col gap-3"
            style={{
              paddingTop: 16,
              paddingLeft: 16,
              paddingRight: 16,
              paddingBottom: 16,
              borderLeft: "1px solid var(--border)",
            }}
          />
        </div>
      </section>
    </main>
  );
}
