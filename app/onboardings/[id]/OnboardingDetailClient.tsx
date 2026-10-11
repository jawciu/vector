"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DraggableSyntheticListeners,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { computeHealth } from "@/lib/health";
import Button from "@/app/ui/Button";
import { PlusIcon } from "@/app/ui/Icons";
import TaskCard from "@/app/components/TaskCard";
import CreateTaskModal from "@/app/components/CreateTaskModal";
import CompanyAvatar from "@/app/ui/CompanyAvatar";
import TaskDrawer from "@/app/components/TaskDrawer";
import OnboardingActions from "@/app/components/OnboardingActions";
import PhaseHeader from "@/app/components/PhaseHeader";
import OnboardingTabs from "@/app/components/OnboardingTabs";
import DetailsTab from "@/app/components/DetailsTab";
import MembersTab from "@/app/components/MembersTab";
import ActionsTab from "@/app/components/ActionsTab";
import MeetingsTab from "@/app/components/MeetingsTab";
import InsightsPanel from "@/app/components/InsightsPanel";
import TaskFilterMenu from "@/app/components/TaskFilterMenu";
import { taskMatchesFilter } from "@/lib/taskFilters";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { avatarColor, avatarInitials } from "@/lib/avatar";
import Tooltip from "@/app/ui/Tooltip";
import Badge from "@/app/ui/Badge";
import type { OnboardingDetail } from "@/lib/types";
import type { OnboardingSnapshot } from "@/lib/ai/context";
import type { ClientContact, ClientPhase, ClientTask, ClientVendorUser } from "@/app/components/types";

type SortableColumnProps = {
  id: string;
  children: ReactNode | ((listeners: DraggableSyntheticListeners) => ReactNode);
};

function SortableColumn({ id, children }: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // Fixed width, not just a minimum: without maxWidth a long task title makes
    // the column (and its cards) stretch, so columns end up different widths.
    // 264 content + 24px marginRight = 288px total footprint per column.
    width: 264,
    minWidth: 264,
    maxWidth: 264,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
    marginRight: 24,
    minHeight: 0,
  };

  return (
    <div ref={setNodeRef} data-col-id={id} style={style} {...attributes}>
      {typeof children === "function" ? children(listeners) : children}
    </div>
  );
}

type InsightsPanelProps = ComponentProps<typeof InsightsPanel>;

type OnboardingDetailClientProps = {
  onboarding: OnboardingDetail;
  tasks: ClientTask[];
  contacts?: ClientContact[];
  phases?: ClientPhase[];
  magicLinks?: ComponentProps<typeof MembersTab>["magicLinks"];
  vendorUsers?: ClientVendorUser[];
  actionCount?: number;
  insightSnapshot: OnboardingSnapshot | null;
  insightContextHash: InsightsPanelProps["contextHash"];
  cachedInsight: InsightsPanelProps["cachedInsight"];
  meetings?: ComponentProps<typeof MeetingsTab>["meetings"];
};

export default function OnboardingDetailClient({
  onboarding,
  tasks: initialTasks,
  contacts: initialContacts,
  phases: initialPhases,
  magicLinks: initialMagicLinks,
  vendorUsers: initialVendorUsers,
  actionCount: initialActionCount = 0,
  insightSnapshot,
  insightContextHash,
  cachedInsight,
  meetings = [],
}: OnboardingDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState(initialTasks);
  const [contacts, setContacts] = useState(initialContacts || []);
  const [phases, setPhases] = useState(initialPhases || []);
  const [error, setError] = useState("");
  const [addingInPhase, setAddingInPhase] = useState<number | null>(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [activeTask, setActiveTask] = useState<ClientTask | null>(null);
  const [activePhase, setActivePhase] = useState<ClientPhase | null>(null);
  const [mounted, setMounted] = useState(false);
  const [drawerTask, setDrawerTask] = useState<ClientTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionCount, setActionCount] = useState(initialActionCount);

  // Live-update the Actions tab badge. Server provides initial count;
  // we refetch on any PendingAIChange change for this onboarding (insert,
  // approve, reject), and on window focus as a fallback.
  useEffect(() => {
    let cancelled = false;
    let client: Awaited<ReturnType<typeof createSupabaseClient>> = null;
    let channel: RealtimeChannel | null = null;

    async function refetchCount() {
      try {
        const res = await fetch(
          `/api/ai-drafts?status=pending&onboardingId=${onboarding.id}&limit=200`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setActionCount(json.pendingCount ?? 0);
      } catch {
        // Silent — badge is best-effort.
      }
    }

    function onFocus() { refetchCount(); }
    window.addEventListener("focus", onFocus);

    (async () => {
      const supabase = await createSupabaseClient();
      if (cancelled || !supabase) return;
      client = supabase;
      channel = supabase
        .channel(`onboarding-${onboarding.id}-action-count`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "PendingAIChange" },
          () => refetchCount()
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel && client) client.removeChannel(channel);
    };
  }, [onboarding.id]);
  const drawerRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  // Which deep-linked task we have already scrolled to, so the effect below
  // can re-run freely without re-scrolling or fighting its own state updates.
  const deepLinkScrolledRef = useRef<number | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const phasesRef = useRef(phases);
  phasesRef.current = phases;

  useEffect(() => { setMounted(true); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    if (searchParams.get("task")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("task");
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!drawerOpen) return;
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && drawerRef.current.contains(e.target as Node)) return;
      if ((e.target as Element).closest("[data-task-card]")) return;
      closeDrawer();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [drawerOpen, closeDrawer]);

  // Deep-link: ?task=<id> opens the task drawer (used by the notification
  // inbox, and by the AI draft inbox's "Created RAY-40 in ..." toast).
  useEffect(() => {
    const raw = searchParams.get("task");
    if (!raw) {
      deepLinkScrolledRef.current = null;
      return;
    }
    const id = Number(raw);
    if (Number.isNaN(id)) return;
    const target = tasksRef.current.find((t) => t.id === id);
    if (!target) return;
    if (!(drawerTask?.id === id && drawerOpen)) {
      setDrawerTask(target);
      setDrawerOpen(true);
    }

    // The board scrolls horizontally, and a newly created task often lands in
    // a phase past the right-hand edge, so opening the drawer alone still
    // leaves the card off screen. Centre its column.
    //
    // Wait for `mounted`: until it flips, the board renders bare, and flipping
    // it re-parents the same markup under DndContext. React remounts that
    // subtree, so the scroller is a brand new node and any scrollLeft set
    // before then is thrown away.
    if (!mounted) return;
    // Guarded by a ref rather than cancelled in cleanup, because the setState
    // calls above are in this effect's own dependencies: it re-runs at once,
    // and a cleanup would cancel the scroll before it ever ran.
    if (deepLinkScrolledRef.current === id) return;
    deepLinkScrolledRef.current = id;

    // Measured from bounding rects, not offsetLeft, since the scroller is not
    // the columns' offsetParent.
    requestAnimationFrame(() => {
      const container = boardScrollRef.current;
      const col = container?.querySelector<HTMLElement>(`[data-col-id="col-${target.phaseId}"]`);
      if (!container || !col) return;
      const cRect = container.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const delta = colRect.left - cRect.left - (cRect.width - colRect.width) / 2;
      container.scrollTo({
        left: Math.max(0, container.scrollLeft + delta),
        behavior: "smooth",
      });
    });
  }, [searchParams, drawerTask, drawerOpen, mounted]);

  const activeTab = searchParams.get("tab") || "overview";
  const taskFilter = searchParams.get("filter") || "active";

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  }

  function setFilter(filter: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", filter);
    router.push(`?${params.toString()}`);
  }

  const { status: health, reasons: healthReasons } = computeHealth(tasks, {
    targetGoLive: onboarding.targetGoLive,
    createdAt: onboarding.createdAt,
  });
  const healthTooltipLines = healthReasons.length > 0 ? healthReasons : null;
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;

  const filteredTasks = tasks.filter((t) => taskMatchesFilter(t, taskFilter));

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
    tasks: filteredTasks
      .filter((t) => t.phaseId === phase.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  // `people` (string list) is still used for the legacy Members field on
  // tasks. Owner now uses the `vendorUsers` array (see TaskDrawer).
  const vendorUsers = initialVendorUsers ?? [];
  const people = Array.from(
    new Set([
      ...contacts.map((c) => c.name).filter(Boolean),
      onboarding.companyName,
      ...(tasks.map((t) => t.owner).filter(Boolean) as string[]),
      ...tasks.flatMap((t) => t.members || []).filter(Boolean),
    ])
  ).filter((p) => p.trim().length > 0);

  function handleOpenDrawer(task: ClientTask) {
    setDrawerTask(task);
    setDrawerOpen(true);
  }

  function handleTaskCreated(newTask: ClientTask) {
    setTasks((prev) => [...prev, newTask]);
    setAddingInPhase(null); // close modal
  }

  function handleTaskUpdated(updatedTask: ClientTask) {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    if (drawerTask && drawerTask.id === updatedTask.id) {
      setDrawerTask(updatedTask);
    }
  }

  function handleTaskDeleted(taskId: number) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handlePhaseUpdated(updatedPhase: ClientPhase) {
    setPhases((prev) => prev.map((p) => (p.id === updatedPhase.id ? updatedPhase : p)));
  }

  function handlePhaseDeleted(phaseId: number) {
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
      const newPhase: ClientPhase = await res.json();
      setPhases((prev) => [...prev, newPhase]);
      setNewPhaseName("");
      setAddingPhase(false);
    } catch {
      setError("Failed to add phase");
    }
  }

  // ── Drag & drop helpers ──────────────────────────────────────
  const isColId = (id: UniqueIdentifier) => String(id).startsWith("col-");
  const toPhaseId = (colId: UniqueIdentifier) => Number(String(colId).replace("col-", ""));

  // ── Drag & drop handlers ──────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    document.documentElement.classList.add("grabbing");
    const id = event.active.id;
    if (isColId(id)) {
      const phase = phasesRef.current.find((p) => p.id === toPhaseId(id));
      setActivePhase(phase || null);
    } else {
      const task = tasksRef.current.find((t) => t.id === id);
      setActiveTask(task || null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    if (isColId(active.id)) return;

    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const current = tasksRef.current;
    const activeTaskData = current.find((t) => t.id === activeId);
    if (!activeTaskData) return;

    let targetPhaseId: number | null;
    if (isColId(overId)) {
      targetPhaseId = toPhaseId(overId);
    } else {
      const overTask = current.find((t) => t.id === overId);
      targetPhaseId = overTask ? overTask.phaseId : null;
    }

    if (!targetPhaseId || activeTaskData.phaseId === targetPhaseId) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, phaseId: targetPhaseId } : t))
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    document.documentElement.classList.remove("grabbing");
    const { active, over } = event;
    setActiveTask(null);
    setActivePhase(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // ── Column reorder ──
    if (isColId(activeId)) {
      // Resolve over target: could be a col-ID or a task inside a column
      let resolvedOverColId: UniqueIdentifier | undefined;
      if (isColId(overId)) {
        resolvedOverColId = overId;
      } else {
        // Over target is a task — find which phase it belongs to
        const overTask = tasksRef.current.find((t) => t.id === overId);
        if (overTask) resolvedOverColId = `col-${overTask.phaseId}`;
      }
      if (!resolvedOverColId || activeId === resolvedOverColId) return;

      const currentPhases = phasesRef.current;
      const sorted = [...currentPhases].sort((a, b) => a.sortOrder - b.sortOrder);
      const activeIdx = sorted.findIndex((p) => p.id === toPhaseId(activeId));
      const overIdx = sorted.findIndex((p) => p.id === toPhaseId(resolvedOverColId));
      if (activeIdx === -1 || overIdx === -1 || activeIdx === overIdx) return;

      const reordered = arrayMove(sorted, activeIdx, overIdx);
      const prevPhases = currentPhases;

      // Optimistic update
      setPhases(reordered.map((p, i) => ({ ...p, sortOrder: i })));

      // Persist each changed sortOrder
      try {
        await Promise.all(
          reordered.map((p, i) => {
            if (p.sortOrder === i) return null;
            return fetch(`/api/phases/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sortOrder: i }),
            });
          }).filter(Boolean)
        );
      } catch {
        setPhases(prevPhases);
      }
      return;
    }

    // ── Task reorder ──
    const current = tasksRef.current;
    const activeTaskData = current.find((t) => t.id === activeId);
    if (!activeTaskData) return;

    const targetPhaseId = activeTaskData.phaseId;

    const colTasks = current
      .filter((t) => t.phaseId === targetPhaseId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const activeIdx = colTasks.findIndex((t) => t.id === activeId);
    const overIdx = colTasks.findIndex((t) => t.id === overId);

    if (activeIdx !== -1 && activeIdx === overIdx) return;

    const reordered = activeIdx === -1
      ? [...colTasks, activeTaskData]
      : arrayMove(colTasks, activeIdx, overIdx < 0 ? colTasks.length - 1 : overIdx);

    const sortMap = new Map<UniqueIdentifier, number>();
    reordered.forEach((t, i) => sortMap.set(t.id, i));

    const prevTasks = current;
    setTasks((prev) =>
      prev.map((t) => {
        if (sortMap.has(t.id)) {
          return { ...t, phaseId: targetPhaseId, sortOrder: sortMap.get(t.id)! };
        }
        return t;
      })
    );

    const newSortOrder = sortMap.get(activeId) ?? 0;
    try {
      await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: activeId, targetPhaseId, sortOrder: newSortOrder }),
      });
    } catch {
      setTasks(prevTasks);
    }
  }

  // Member avatars (up to 4 + overflow)
  const memberAvatars = contacts.slice(0, 4);
  const memberOverflow = contacts.length > 4 ? contacts.length - 4 : 0;

  return (
    <main className="w-full flex flex-col h-full overflow-hidden">
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
            <CompanyAvatar
              name={onboarding.companyName}
              logoUrl={onboarding.companyLogoUrl}
              size={20}
              fontSize={10}
            />
            <span className="font-medium" style={{ color: "var(--text)" }}>
              {onboarding.companyName}
            </span>
            <OnboardingActions onboarding={onboarding} />
          </div>
        </div>
      </nav>

      {/* Tab bar */}
      <OnboardingTabs
        activeTab={activeTab}
        onTabChange={setTab}
        badges={{ actions: actionCount }}
      />

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
      {activeTab === "overview" && insightSnapshot && (
        <InsightsPanel
          scope="onboarding"
          scopeId={onboarding.id}
          snapshot={insightSnapshot}
          contextHash={insightContextHash}
          cachedInsight={cachedInsight}
          companyName={onboarding.companyName}
          health={health}
          tasks={tasks}
          onTaskClick={handleOpenDrawer}
        />
      )}

      {activeTab === "tasks" && (
        <div className="flex flex-col flex-1 overflow-hidden">
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
              <TaskFilterMenu value={taskFilter} onChange={setFilter} />

              {/* Sort button */}
              <Button
                variant="secondary" className="flex items-center gap-1.5 ml-2"
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                disabled
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                  <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Sort</span>
              </Button>

              {/* Filter button */}
              <Button
                variant="secondary" className="flex items-center gap-1.5"
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                disabled
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)" }}>
                  <path d="M1 2h12l-4.5 5.5V12l-3-1.5V7.5L1 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                </svg>
                <span>Filter</span>
              </Button>
            </div>

            {/* Right: health tags + member avatars */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {health !== "On track" && (
                <Tooltip lines={healthTooltipLines ?? undefined}>
                  {/* Health is outlined everywhere: the filled pill of these
                      same colours is the AI trend pill, and the two must never
                      be mistaken for each other. */}
                  <span className="health-pill">
                    <Badge health={health}>{health}</Badge>
                  </span>
                </Tooltip>
              )}
              {blockedCount > 0 && (
                // Wrapper keeps the badge from being a direct flex child: as a
                // flex item the span blockifies (display:block) and renders 2px
                // taller than the inline card/health badges. The plain wrapper
                // lets it flow inline so it matches their proportions exactly.
                <span>
                  <span
                    className="text-sm rounded-md"
                    style={{ background: "var(--danger)", color: "var(--text-dark)", border: "0.5px solid transparent", padding: "2px 4px" }}
                  >
                    {blockedCount} blocked
                  </span>
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
                        background: avatarColor(contact.name),
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
          {(() => {
            const columnIds = columns.map(({ phase }) => `col-${phase.id}`);

            const boardContent = (
              <div ref={boardScrollRef} style={{ overflowX: "auto", flex: 1, minHeight: 0 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    minWidth: phases.length * 288,
                    padding: "12px 16px",
                    alignItems: "stretch",
                    height: "100%",
                  }}
                >
                  <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
                    {columns.map(({ phase, tasks: colTasks }) => (
                      <SortableColumn key={phase.id} id={`col-${phase.id}`}>
                        {(dragListeners) => (
                          <>
                            {/* Column header */}
                            <div style={{ marginBottom: 8, flexShrink: 0 }}>
                              <PhaseHeader
                                phase={phase}
                                onPhaseUpdated={handlePhaseUpdated}
                                onPhaseDeleted={handlePhaseDeleted}
                                onAddTask={() => setAddingInPhase(phase.id)}
                                dragListeners={dragListeners}
                              />
                            </div>

                            {/* Scrollable task list + add button */}
                            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                              <SortableContext
                                id={String(phase.id)}
                                items={colTasks.map((t) => t.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="flex flex-col gap-2" style={{ minHeight: 40 }}>
                                  {colTasks.map((t) => (
                                    <TaskCard
                                      key={t.id}
                                      task={t}
                                      onTaskUpdated={handleTaskUpdated}
                                      onTaskDeleted={handleTaskDeleted}
                                      onCardClick={handleOpenDrawer}
                                      people={people}
                                    />
                                  ))}
                                </div>
                              </SortableContext>

                              {/* Add task button */}
                              <div style={{ marginTop: colTasks.length > 0 ? 8 : 0 }}>
                                {/* eslint-disable-next-line no-restricted-syntax -- full-width add row, not a DS button */}
                                <button
                                  onClick={() => setAddingInPhase(phase.id)}
                                  className="add-task-btn flex items-center gap-1 w-full text-sm"
                                  style={{
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: 8,
                                    padding: "8px 16px",
                                    background: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                  </svg>
                                  Add task
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </SortableColumn>
                    ))}
                  </SortableContext>

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
                          <Button
                            variant="tertiary"
                            size="xs"
                            onClick={() => { setAddingPhase(false); setNewPhaseName(""); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="tertiary"
                        onClick={() => setAddingPhase(true)}
                      >
                        <PlusIcon />Add section
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );

            if (!mounted) return boardContent;

            return (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => { document.documentElement.classList.remove("grabbing"); setActiveTask(null); setActivePhase(null); }}
              >
                {boardContent}
                <DragOverlay>
                  {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
                  {activePhase ? (
                    <div
                      style={{
                        minWidth: 264,
                        background: "var(--bg)",
                        borderRadius: 8,
                        padding: "8px 0",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                      }}
                    >
                      <PhaseHeader phase={activePhase} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            );
          })()}
        </div>
      )}

      {activeTab === "details" && (
        <div className="flex-1 overflow-y-auto">
          <DetailsTab onboarding={onboarding} />
        </div>
      )}

      {activeTab === "members" && (
        <div className="flex-1 overflow-y-auto">
          <MembersTab
            onboardingId={onboarding.id}
            contacts={contacts}
            onContactsChange={setContacts}
            magicLinks={initialMagicLinks || []}
          />
        </div>
      )}

      {activeTab === "actions" && (
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 24px" }}>
          <ActionsTab
            onboardingId={onboarding.id}
            vendorUsers={vendorUsers}
            contacts={contacts}
            phases={phases}
            openTasks={tasks.filter((t) => t.status !== "Done")}
            onTaskCreated={handleTaskCreated}
          />
        </div>
      )}

      {activeTab === "meetings" && (
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 24px" }}>
          <MeetingsTab meetings={meetings} />
        </div>
      )}

      {/* Create task modal */}
      <CreateTaskModal
        open={addingInPhase !== null}
        onClose={() => setAddingInPhase(null)}
        onboardingId={onboarding.id}
        phaseId={addingInPhase}
        phaseName={phases.find((p) => p.id === addingInPhase)?.name || ""}
        companyName={onboarding.companyName}
        companyLogoUrl={onboarding.companyLogoUrl}
        onTaskCreated={handleTaskCreated}
        people={people}
        vendorUsers={vendorUsers}
        contacts={contacts}
        allTasks={tasks}
      />

      {/* Task detail drawer */}
      <TaskDrawer
        ref={drawerRef}
        task={drawerTask}
        open={drawerOpen}
        onClose={closeDrawer}
        onTaskUpdated={handleTaskUpdated}
        people={people}
        vendorUsers={vendorUsers}
        contacts={contacts}
        allTasks={tasks}
      />
    </main>
  );
}
