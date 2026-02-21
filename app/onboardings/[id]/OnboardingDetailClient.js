"use client";

import { useState, useRef, useEffect } from "react";
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
import { MenuTriggerButton, MenuList, MenuOption } from "@/app/components/Menu";

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
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

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
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 16,
              paddingRight: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            {/* Left: filter dropdown + sort */}
            <div className="flex items-center gap-1">
              <div ref={filterRef} className="relative">
                <MenuTriggerButton
                  onClick={() => setFilterOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={filterOpen}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "var(--text-muted)" }}>
                        <g clipPath="url(#clip0_68_354)">
                          <path d="M1 10.3333C1 9.435 1 8.98583 1.20242 8.65567C1.31558 8.47075 1.47075 8.31558 1.65567 8.20242C1.98525 8 2.435 8 3.33333 8C4.23167 8 4.68083 8 5.011 8.20242C5.19592 8.31558 5.35108 8.47075 5.46425 8.65567C5.66667 8.98525 5.66667 9.435 5.66667 10.3333C5.66667 11.2317 5.66667 11.6808 5.46425 12.0116C5.35108 12.1959 5.19592 12.3511 5.011 12.4643C4.68142 12.6667 4.23167 12.6667 3.33333 12.6667C2.435 12.6667 1.98583 12.6667 1.65567 12.4643C1.47095 12.3513 1.31563 12.1962 1.20242 12.0116C1 11.6808 1 11.2317 1 10.3333ZM8 10.3333C8 9.435 8 8.98583 8.20242 8.65567C8.31558 8.47075 8.47075 8.31558 8.65567 8.20242C8.98525 8 9.435 8 10.3333 8C11.2317 8 11.6808 8 12.0116 8.20242C12.1959 8.31558 12.3511 8.47075 12.4643 8.65567C12.6667 8.98525 12.6667 9.435 12.6667 10.3333C12.6667 11.2317 12.6667 11.6808 12.4643 12.0116C12.351 12.1959 12.1959 12.351 12.0116 12.4643C11.6808 12.6667 11.2317 12.6667 10.3333 12.6667C9.435 12.6667 8.98583 12.6667 8.65567 12.4643C8.47095 12.3513 8.31563 12.1962 8.20242 12.0116C8 11.6808 8 11.2317 8 10.3333ZM1 3.33333C1 2.435 1 1.98583 1.20242 1.65567C1.31558 1.47075 1.47075 1.31558 1.65567 1.20242C1.98525 1 2.435 1 3.33333 1C4.23167 1 4.68083 1 5.011 1.20242C5.19592 1.31558 5.35108 1.47075 5.46425 1.65567C5.66667 1.98525 5.66667 2.435 5.66667 3.33333C5.66667 4.23167 5.66667 4.68083 5.46425 5.011C5.35108 5.19592 5.19592 5.35108 5.011 5.46425C4.68142 5.66667 4.23167 5.66667 3.33333 5.66667C2.435 5.66667 1.98583 5.66667 1.65567 5.46425C1.47089 5.35111 1.31556 5.19578 1.20242 5.011C1 4.68142 1 4.23167 1 3.33333ZM8 3.33333C8 2.435 8 1.98583 8.20242 1.65567C8.31558 1.47075 8.47075 1.31558 8.65567 1.20242C8.98525 1 9.435 1 10.3333 1C11.2317 1 11.6808 1 12.0116 1.20242C12.1959 1.31558 12.3511 1.47075 12.4643 1.65567C12.6667 1.98525 12.6667 2.435 12.6667 3.33333C12.6667 4.23167 12.6667 4.68083 12.4643 5.011C12.3511 5.19592 12.1959 5.35108 12.0116 5.46425C11.6808 5.66667 11.2317 5.66667 10.3333 5.66667C9.435 5.66667 8.98583 5.66667 8.65567 5.46425C8.47089 5.35111 8.31556 5.19578 8.20242 5.011C8 4.68142 8 4.23167 8 3.33333Z" stroke="currentColor" strokeWidth="0.878906"/>
                        </g>
                        <defs>
                          <clipPath id="clip0_68_354">
                            <rect width="13.6667" height="13.6667" fill="white"/>
                          </clipPath>
                        </defs>
                      </svg>
                      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Showing</span>
                      {TASK_FILTERS.find((f) => f.id === taskFilter)?.label}
                    </span>
                  </span>
                </MenuTriggerButton>
                {filterOpen && (
                  <MenuList>
                    {TASK_FILTERS.map(({ id, label }) => (
                      <MenuOption
                        key={id}
                        active={id === taskFilter}
                        onClick={() => { setFilter(id); setFilterOpen(false); }}
                      >
                        {label}
                      </MenuOption>
                    ))}
                  </MenuList>
                )}
              </div>

              {/* Sort button */}
              <button
                className="btn-secondary flex items-center gap-1.5 text-sm rounded-lg ml-2"
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                disabled
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                  <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Sort</span>
              </button>

              {/* Filter button */}
              <button
                className="btn-secondary flex items-center gap-1.5 text-sm rounded-lg"
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                disabled
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                  <path d="M1 2h12l-4.5 5.5V12l-3-1.5V7.5L1 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                </svg>
                <span>Filter</span>
              </button>
            </div>

            {/* Right: health tags + member avatars */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {health !== "On track" && (
                <span
                  className="text-sm rounded-md"
                  style={{
                    color: health === "Blocked" ? "var(--danger)" : "var(--alert)",
                    border: `0.5px solid ${health === "Blocked" ? "var(--danger)" : "var(--alert)"}`,
                    padding: "2px 4px",
                  }}
                >
                  {health}
                </span>
              )}
              {blockedCount > 0 && (
                <span
                  className="text-sm rounded-md"
                  style={{ color: "var(--danger)", border: "0.5px solid var(--danger)", padding: "2px 4px" }}
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
                padding: "12px 16px",
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
