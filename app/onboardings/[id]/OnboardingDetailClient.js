"use client";

import { useState } from "react";
import Button from "@/app/ui/Button";
import Link from "next/link";
import { computeHealth } from "@/lib/health";
import TaskCard from "@/app/components/TaskCard";
import CreateTaskCard from "@/app/components/CreateTaskCard";
import OnboardingActions from "@/app/components/OnboardingActions";
import ContactsPanel from "@/app/components/ContactsPanel";
import PhaseHeader from "@/app/components/PhaseHeader";

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

function isTaskBlocked(task) {
  if (task.blockedByTask && task.blockedByTask.status !== "Done") return true;
  if (task.waitingOn && task.waitingOn.trim() !== "") return true;
  return false;
}

const TASK_FILTERS = ["Active", "Blocked", "Done", "All"];

export default function OnboardingDetailClient({ onboarding, tasks: initialTasks, contacts: initialContacts, phases: initialPhases }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [contacts, setContacts] = useState(initialContacts || []);
  const [phases, setPhases] = useState(initialPhases || []);
  const [error, setError] = useState("");
  const [taskFilter, setTaskFilter] = useState("Active");
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");

  const health = computeHealth(tasks);
  const blockedCount = tasks.filter((t) => isTaskBlocked(t)).length;

  // Filter tasks based on selected filter
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "Active") return t.status !== "Done";
    if (taskFilter === "Done") return t.status === "Done";
    if (taskFilter === "Blocked") return isTaskBlocked(t) && t.status !== "Done";
    return true; // "All"
  });

  // Build columns from phases
  const columns = phases.map((phase) => ({
    phase,
    tasks: filteredTasks.filter((t) => t.phaseId === phase.id),
  }));

  // Recompute phase counts from current tasks state
  const phasesWithCounts = phases.map((phase) => {
    const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
    return {
      ...phase,
      taskCount: phaseTasks.length,
      doneCount: phaseTasks.filter((t) => t.status === "Done").length,
    };
  });

  // Collect unique people from contacts, tasks, and onboarding
  const people = Array.from(
    new Set([
      ...contacts.map(c => c.name).filter(Boolean),
      onboarding.companyName,
      ...tasks.map(t => t.owner).filter(Boolean),
      ...tasks.map(t => t.waitingOn).filter(Boolean),
    ])
  ).filter(p => p.trim().length > 0);

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

  function handlePhaseUpdated(updatedPhase) {
    setPhases(prev => prev.map(p => p.id === updatedPhase.id ? updatedPhase : p));
  }

  function handlePhaseDeleted(phaseId) {
    setPhases(prev => prev.filter(p => p.id !== phaseId));
  }

  async function handleAddPhase() {
    if (!newPhaseName.trim()) return;

    try {
      const maxSort = phases.reduce((max, p) => Math.max(max, p.sortOrder), -1);
      const res = await fetch("/api/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingId: Number(onboarding.id),
          name: newPhaseName.trim(),
          sortOrder: maxSort + 1,
        }),
      });
      if (!res.ok) throw new Error("Failed to create phase");
      const newPhase = await res.json();
      setPhases(prev => [...prev, newPhase]);
      setNewPhaseName("");
      setAddingPhase(false);
    } catch {
      setError("Failed to add phase");
    }
  }

  const colCount = phases.length + 1; // +1 for "Add section" column

  return (
    <main className="w-full flex flex-col" style={{ minHeight: "100vh" }}>
      <nav
        className="w-full flex items-center justify-between text-sm border-b"
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          height: 44,
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
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
          <OnboardingActions onboarding={onboarding} />
          </div>
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
            {onboarding.owner && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Owner: <span style={{ color: "var(--text)" }}>{onboarding.owner}</span>
              </span>
            )}
            {onboarding.targetGoLive && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Go-live: <span style={{ color: "var(--text)" }}>
                  {new Date(onboarding.targetGoLive).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <ContactsPanel
          onboardingId={onboarding.id}
          contacts={contacts}
          onContactsChange={setContacts}
        />
      </div>

      <section className="flex-1 flex flex-col" style={{ borderTop: "1px solid var(--border)" }}>
        {/* Filter bar */}
        <div
          className="flex items-center justify-end gap-1"
          style={{
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span className="text-xs mr-2" style={{ color: "var(--text-muted)" }}>Tasks:</span>
          {TASK_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setTaskFilter(filter)}
              className="task-filter-btn text-xs font-medium rounded-md"
              style={{
                paddingTop: 4,
                paddingBottom: 4,
                paddingLeft: 10,
                paddingRight: 10,
                color: taskFilter === filter ? "var(--text)" : "var(--text-muted)",
                background: taskFilter === filter ? "var(--surface-hover)" : "transparent",
                border: taskFilter === filter ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {filter}
              {filter === "Done" && (
                <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                  ({tasks.filter(t => t.status === "Done").length})
                </span>
              )}
              {filter === "Blocked" && blockedCount > 0 && (
                <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                  ({blockedCount})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable kanban grid */}
        <div style={{ overflowX: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ minWidth: colCount * 240, display: "flex", flexDirection: "column", flex: 1 }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, minmax(240px, 1fr))`, borderBottom: "1px solid var(--border)" }}>
              {phasesWithCounts.map((phase, colIdx) => (
                <div
                  key={phase.id}
                  style={{
                    paddingTop: 12,
                    paddingBottom: 12,
                    paddingLeft: 16,
                    paddingRight: 16,
                    borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
                  }}
                >
                  <PhaseHeader
                    phase={phase}
                    onPhaseUpdated={handlePhaseUpdated}
                    onPhaseDeleted={handlePhaseDeleted}
                  />
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
                {addingPhase ? (
                  <div className="flex flex-col gap-2 w-full">
                    <input
                      type="text"
                      placeholder="Phase name"
                      value={newPhaseName}
                      onChange={(e) => setNewPhaseName(e.target.value)}
                      autoFocus
                      className="text-base font-bold outline-none w-full"
                      style={{
                        background: "transparent",
                        color: "var(--text)",
                        border: "none",
                        borderBottom: "1px solid var(--action)",
                        paddingBottom: 2,
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddPhase();
                        if (e.key === "Escape") { setAddingPhase(false); setNewPhaseName(""); }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button size="xs" onClick={handleAddPhase}>
                        Add
                      </Button>
                      <button
                        onClick={() => { setAddingPhase(false); setNewPhaseName(""); }}
                        className="text-xs font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingPhase(true)}
                    className="text-base font-bold"
                    style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    + Add section
                  </button>
                )}
              </div>
            </div>

            {/* Content row */}
            <div className="flex-1" style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, minmax(240px, 1fr))` }}>
              {columns.map(({ phase, tasks: colTasks }, colIdx) => (
                <div
                  key={phase.id}
                  className="flex flex-col gap-3"
                  style={{
                    paddingTop: 16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 16,
                    borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
                  }}
                >
                  {colTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onTaskUpdated={handleTaskUpdated}
                      onTaskDeleted={handleTaskDeleted}
                      people={people}
                      allTasks={tasks}
                    />
                  ))}
                  <CreateTaskCard
                    onboardingId={onboarding.id}
                    phaseId={phase.id}
                    onTaskCreated={handleTaskCreated}
                    people={people}
                    allTasks={tasks}
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
          </div>
        </div>
      </section>
    </main>
  );
}
