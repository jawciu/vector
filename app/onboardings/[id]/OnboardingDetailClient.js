"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { computeHealth } from "@/lib/health";
import Button from "@/app/ui/Button";
import TaskCard from "@/app/components/TaskCard";
import CreateTaskCard from "@/app/components/CreateTaskCard";
import OnboardingActions from "@/app/components/OnboardingActions";
import PhaseHeader from "@/app/components/PhaseHeader";
import OnboardingTabs from "@/app/components/OnboardingTabs";
import DetailsTab from "@/app/components/DetailsTab";
import MembersTab from "@/app/components/MembersTab";
import CommunicationTab from "@/app/components/CommunicationTab";

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

const TASK_FILTERS = [
  { id: "active", label: "Active" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

export default function OnboardingDetailClient({
  onboarding,
  tasks: initialTasks,
  contacts: initialContacts,
  phases: initialPhases,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState(initialTasks);
  const [contacts, setContacts] = useState(initialContacts || []);
  const [phases, setPhases] = useState(initialPhases || []);
  const [error, setError] = useState("");
  const [addingInPhase, setAddingInPhase] = useState(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");

  const activeTab = searchParams.get("tab") || "tasks";
  const taskFilter = searchParams.get("filter") || "active";

  function setTab(tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  }

  function setFilter(filter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", filter);
    router.push(`?${params.toString()}`);
  }

  const health = computeHealth(tasks);
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "active") return t.status !== "Done";
    if (taskFilter === "done") return t.status === "Done";
    if (taskFilter === "blocked") return t.status === "Blocked";
    return true; // "all"
  });

  const phasesWithCounts = phases.map((phase) => {
    const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
    return {
      ...phase,
      taskCount: phaseTasks.length,
      doneCount: phaseTasks.filter((t) => t.status === "Done").length,
    };
  });

  const columns = phasesWithCounts.map((phase) => ({
    phase,
    tasks: filteredTasks.filter((t) => t.phaseId === phase.id),
  }));

  const people = Array.from(
    new Set([
      ...contacts.map((c) => c.name).filter(Boolean),
      onboarding.companyName,
      ...tasks.map((t) => t.owner).filter(Boolean),
      ...tasks.map((t) => t.waitingOn).filter(Boolean),
    ])
  ).filter((p) => p.trim().length > 0);

  function handleTaskCreated(newTask) {
    setTasks((prev) => [...prev, newTask]);
    setAddingInPhase(null);
  }

  function handleTaskUpdated(updatedTask) {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  }

  function handleTaskDeleted(taskId) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handlePhaseUpdated(updatedPhase) {
    setPhases((prev) => prev.map((p) => (p.id === updatedPhase.id ? updatedPhase : p)));
  }

  function handlePhaseDeleted(phaseId) {
    setPhases((prev) => prev.filter((p) => p.id !== phaseId));
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
      setPhases((prev) => [...prev, newPhase]);
      setNewPhaseName("");
      setAddingPhase(false);
    } catch {
      setError("Failed to add phase");
    }
  }

  // Member avatars (up to 4 + overflow)
  const memberAvatars = contacts.slice(0, 4);
  const memberOverflow = contacts.length > 4 ? contacts.length - 4 : 0;

  return (
    <main className="w-full flex flex-col" style={{ minHeight: "100vh" }}>
      {/* Breadcrumb nav */}
      <nav
        className="w-full flex items-center justify-between text-sm border-b"
        style={{ paddingLeft: 16, paddingRight: 16, height: 44, borderColor: "var(--border)" }}
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
              style={{ background: companyLogoColor(onboarding.companyName), color: "var(--text-dark)" }}
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

      {/* Tab bar */}
      <OnboardingTabs activeTab={activeTab} onTabChange={setTab} />

      {error && (
        <div
          className="mx-4 mt-3 text-sm px-3 py-2 rounded"
          style={{
            color: "var(--danger)",
            background: "rgba(255, 137, 155, 0.1)",
            border: "1px solid var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "tasks" && (
        <div className="flex flex-col flex-1">
          {/* Action bar */}
          <div
            className="flex items-center justify-between gap-3"
            style={{
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 16,
              paddingRight: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            {/* Left: filter pills + sort + filter */}
            <div className="flex items-center gap-1">
              {TASK_FILTERS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className="text-sm font-medium rounded-md transition-colors"
                  style={{
                    paddingTop: 4,
                    paddingBottom: 4,
                    paddingLeft: 10,
                    paddingRight: 10,
                    color: taskFilter === id ? "var(--text)" : "var(--text-muted)",
                    background: taskFilter === id ? "var(--surface-hover)" : "transparent",
                    border: taskFilter === id ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  {label}
                  {id === "done" && (
                    <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                      ({tasks.filter((t) => t.status === "Done").length})
                    </span>
                  )}
                  {id === "blocked" && blockedCount > 0 && (
                    <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                      ({blockedCount})
                    </span>
                  )}
                </button>
              ))}

              {/* Sort button */}
              <button
                className="btn-secondary flex items-center gap-1.5 text-sm rounded-md ml-2"
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                disabled
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                  <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span style={{ color: "var(--text-muted)" }}>Sort</span>
              </button>

              {/* Filter button */}
              <button
                className="btn-secondary flex items-center gap-1.5 text-sm rounded-md"
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                disabled
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                  <path d="M1 2h12l-4.5 5.5V12l-3-1.5V7.5L1 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                </svg>
                <span style={{ color: "var(--text-muted)" }}>Filter</span>
              </button>
            </div>

            {/* Right: health tags + member avatars */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {health !== "On track" && (
                <span
                  className="text-sm font-medium rounded px-2 py-1"
                  style={{
                    color: health === "Blocked" ? "var(--danger)" : "var(--alert)",
                    border: `1px solid ${health === "Blocked" ? "var(--danger)" : "var(--alert)"}`,
                  }}
                >
                  {health}
                </span>
              )}
              {blockedCount > 0 && (
                <span
                  className="text-sm font-medium rounded px-2 py-1"
                  style={{ color: "var(--danger)", border: "1px solid var(--danger)" }}
                >
                  {blockedCount} blocked
                </span>
              )}

              {/* Member avatars */}
              {contacts.length > 0 && (
                <div className="flex items-center" style={{ gap: -4 }}>
                  {memberAvatars.map((contact, i) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-center text-[9px] font-semibold rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        background: companyLogoColor(contact.name),
                        color: "var(--text-dark)",
                        border: "1.5px solid var(--bg)",
                        marginLeft: i > 0 ? -6 : 0,
                        zIndex: memberAvatars.length - i,
                        position: "relative",
                      }}
                      title={contact.name}
                    >
                      {contact.name.slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                  {memberOverflow > 0 && (
                    <div
                      className="flex items-center justify-center text-[9px] font-semibold rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        background: "var(--surface-hover)",
                        color: "var(--text-muted)",
                        border: "1.5px solid var(--bg)",
                        marginLeft: -6,
                      }}
                    >
                      +{memberOverflow}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Kanban board */}
          <div style={{ overflowX: "auto", flex: 1 }}>
            <div
              style={{
                display: "flex",
                gap: 0,
                minWidth: phases.length * 264,
                padding: "16px 16px",
                alignItems: "flex-start",
              }}
            >
              {columns.map(({ phase, tasks: colTasks }) => (
                <div
                  key={phase.id}
                  style={{
                    minWidth: 240,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    marginRight: 24,
                  }}
                >
                  {/* Column header */}
                  <div style={{ marginBottom: 8 }}>
                    <PhaseHeader
                      phase={phase}
                      onPhaseUpdated={handlePhaseUpdated}
                      onPhaseDeleted={handlePhaseDeleted}
                      onAddTask={() => setAddingInPhase(phase.id)}
                    />
                  </div>

                  {/* Task cards */}
                  <div className="flex flex-col gap-2">
                    {colTasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onTaskUpdated={handleTaskUpdated}
                        onTaskDeleted={handleTaskDeleted}
                        people={people}
                      />
                    ))}

                    {/* Create task */}
                    <CreateTaskCard
                      onboardingId={onboarding.id}
                      phaseId={phase.id}
                      onTaskCreated={handleTaskCreated}
                      people={people}
                      isExpanded={addingInPhase === phase.id}
                      onExpand={() => setAddingInPhase(phase.id)}
                      onCollapse={() => setAddingInPhase(null)}
                    />
                  </div>
                </div>
              ))}

              {/* Add phase column */}
              <div style={{ minWidth: 200, flexShrink: 0 }}>
                {addingPhase ? (
                  <div className="flex flex-col gap-2 px-4 py-1">
                    <input
                      type="text"
                      placeholder="Phase name"
                      value={newPhaseName}
                      onChange={(e) => setNewPhaseName(e.target.value)}
                      autoFocus
                      className="text-sm font-semibold outline-none"
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
                      <Button size="xs" onClick={handleAddPhase}>Add</Button>
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
                    className="text-sm font-semibold px-4 py-1"
                    style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    + Add section
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "details" && <DetailsTab onboarding={onboarding} />}

      {activeTab === "members" && (
        <MembersTab
          onboardingId={onboarding.id}
          contacts={contacts}
          onContactsChange={setContacts}
        />
      )}

      {activeTab === "communication" && <CommunicationTab />}
    </main>
  );
}
