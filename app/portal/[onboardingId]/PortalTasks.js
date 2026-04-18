"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import PortalTaskCard from "./PortalTaskCard";
import PortalDrawer from "./PortalDrawer";
import TaskFilterMenu from "@/app/components/TaskFilterMenu";

function EmptyState({ filter, myOnly }) {
  const messages = {
    active: {
      title: myOnly ? "No active tasks assigned to you" : "No active tasks",
      body: myOnly
        ? "When tasks are assigned to you, they\u2019ll appear here."
        : "All tasks are either done or haven\u2019t been created yet.",
    },
    done: {
      title: myOnly ? "No completed tasks yet" : "No completed tasks",
      body: "Mark tasks as done by checking the checkbox next to them.",
    },
    all: {
      title: myOnly ? "No tasks assigned to you" : "No tasks yet",
      body: myOnly
        ? "Your vendor hasn\u2019t assigned any tasks to you yet."
        : "Tasks will appear here once your vendor sets up the onboarding.",
    },
  };

  const msg = messages[filter] || messages.all;

  return (
    <div className="text-center" style={{ padding: "40px 16px" }}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: "var(--text-muted)", margin: "0 auto 12px" }}
      >
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium" style={{ color: "var(--text)", marginBottom: 4 }}>
        {msg.title}
      </p>
      <p className="text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
        {msg.body}
      </p>
    </div>
  );
}

export default function PortalTasks({ tasks: initialTasks, myOnly, contactName }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("active");
  const [drawerTask, setDrawerTask] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const router = useRouter();

  function handleSessionExpired() {
    router.push("/portal/auth?error=expired");
  }

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    function handleClick(e) {
      if (drawerRef.current && drawerRef.current.contains(e.target)) return;
      if (e.target.closest("[data-task-card]")) return;
      setDrawerOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [drawerOpen]);

  function handleOpenDrawer(task) {
    setDrawerTask(task);
    setDrawerOpen(true);
  }

  function handleTaskUpdated(taskId, updatedTask) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, ...updatedTask } : t
      )
    );
    // Update drawer task if it's the same
    if (drawerTask && drawerTask.id === taskId) {
      setDrawerTask((prev) => ({ ...prev, ...updatedTask }));
    }
  }

  const filtered = tasks.filter((t) => {
    if (myOnly && !t.isAssignedToMe) return false;
    if (filter === "active") return t.status !== "Done";
    if (filter === "done") return t.status === "Done";
    return true;
  });

  // Build columns from phases
  const phaseMap = new Map();
  const phaseOrder = [];
  for (const task of filtered) {
    const key = task.phase?.id || 0;
    if (!phaseMap.has(key)) {
      const group = {
        id: key,
        name: task.phase?.name || "No phase",
        sortOrder: task.phase?.sortOrder ?? 999,
        tasks: [],
      };
      phaseMap.set(key, group);
      phaseOrder.push(group);
    }
    phaseMap.get(key).tasks.push(task);
  }
  phaseOrder.sort((a, b) => a.sortOrder - b.sortOrder);

  // Sort tasks within each column
  for (const col of phaseOrder) {
    col.tasks.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  // Also build all phases (including empty ones) for columns
  const allPhaseIds = new Set();
  for (const t of tasks) {
    if (t.phase?.id) allPhaseIds.add(t.phase.id);
  }
  const allPhases = [];
  const seenPhases = new Set();
  for (const t of tasks) {
    const pid = t.phase?.id || 0;
    if (!seenPhases.has(pid)) {
      seenPhases.add(pid);
      allPhases.push({
        id: pid,
        name: t.phase?.name || "No phase",
        sortOrder: t.phase?.sortOrder ?? 999,
      });
    }
  }
  allPhases.sort((a, b) => a.sortOrder - b.sortOrder);

  // Build columns with empty phases included
  const columns = allPhases.map((phase) => ({
    phase,
    tasks: filtered
      .filter((t) => (t.phase?.id || 0) === phase.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  }));

  return (
    <div>
      {/* Filter dropdown — shared with main product */}
      <div style={{ padding: "12px 16px", paddingBottom: 0 }}>
        <TaskFilterMenu value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} myOnly={myOnly} />
      ) : (
        <>
          {/* ─── MOBILE: stacked list by phase ─── */}
          <div className="flex flex-col gap-4 md:hidden" style={{ padding: "12px 16px" }}>
            {phaseOrder.map((group) => (
              <div key={group.id}>
                <div
                  className="text-xs font-semibold mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  {group.name}
                </div>
                <div className="flex flex-col gap-2">
                  {group.tasks.map((task) => (
                    <PortalTaskCard
                      key={task.id}
                      task={task}
                      onTaskUpdated={handleTaskUpdated}
                      onCardClick={handleOpenDrawer}
                      onSessionExpired={handleSessionExpired}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ─── DESKTOP: Kanban columns ─── */}
          <div className="hidden md:block" style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "flex",
                gap: 0,
                minWidth: columns.length * 264,
                padding: "12px 16px",
                alignItems: "stretch",
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
                    marginRight: 24,
                  }}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between"
                    style={{ marginBottom: 8, padding: "0 4px" }}
                  >
                    <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {phase.name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2" style={{ minHeight: 40 }}>
                    {colTasks.map((task) => (
                      <PortalTaskCard
                        key={task.id}
                        task={task}
                        onTaskUpdated={handleTaskUpdated}
                        onCardClick={handleOpenDrawer}
                        onSessionExpired={handleSessionExpired}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Task drawer */}
      <PortalDrawer
        ref={drawerRef}
        task={drawerTask}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onTaskUpdated={handleTaskUpdated}
        contactName={contactName}
        onSessionExpired={handleSessionExpired}
      />
    </div>
  );
}
