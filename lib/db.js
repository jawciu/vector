/**
 * Postgres read layer via Prisma.
 * Singleton client for Next.js; Prisma 7 needs adapter when run outside CLI.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { computeHealth as computeHealthFromTasks } from "./health.js";

const globalForPrisma = typeof globalThis !== "undefined" ? globalThis : {};
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const STATUSES = ["Not started", "In progress", "Under investigation", "Blocked", "Done"];

/** Check if a task is blocked (status-based). */
export function isTaskBlocked(task) {
  return task.status === "Blocked";
}

export const DEFAULT_PHASES = [
  { name: "Kickoff", sortOrder: 0 },
  { name: "Configuration", sortOrder: 1 },
  { name: "Data Migration", sortOrder: 2 },
  { name: "Training", sortOrder: 3 },
  { name: "Go-Live", sortOrder: 4 },
];

export const CONTACT_ROLES = ["Champion", "Technical Lead", "IT Admin", "Exec Sponsor"];

export const ONBOARDING_STATUSES = ["Active", "Completed", "Paused", "Archived"];

/** List onboardings with company name, health, blocked count, task count. */
export async function getOnboardings(statusFilter) {
  const where = statusFilter && statusFilter !== "All"
    ? { status: statusFilter }
    : {};
  const list = await prisma.onboarding.findMany({
    where,
    include: {
      company: true,
      tasks: {
        include: { blockedByTask: { select: { id: true, status: true } } },
      },
    },
    orderBy: { id: "asc" },
  });
  return list.map((ob) => {
    const health = computeHealthFromTasks(ob.tasks);
    const blockedCount = ob.tasks.filter((t) => isTaskBlocked(t)).length;
    const nextTask = ob.tasks.find(
      (t) => t.status !== "Done" && !isTaskBlocked(t)
    );
    return {
      id: String(ob.id),
      companyName: ob.company.name,
      health,
      blockedCount,
      taskCount: ob.tasks.length,
      nextAction: nextTask ? nextTask.title : null,
      lastActivity: ob.updatedAt ? ob.updatedAt.toISOString() : null,
      owner: ob.owner || null,
      onboardingStatus: ob.status || "Active",
    };
  });
}

/** Single onboarding by id (for detail page). */
export async function getOnboarding(id) {
  const numId = Number(id);
  if (Number.isNaN(numId)) return null;
  const ob = await prisma.onboarding.findUnique({
    where: { id: numId },
    include: { company: true },
  });
  if (!ob) return null;
  return {
    id: String(ob.id),
    companyName: ob.company.name,
    owner: ob.owner || "",
    status: ob.status || "Active",
    targetGoLive: ob.targetGoLive ? ob.targetGoLive.toISOString() : null,
  };
}

/** Tasks for one onboarding (for detail page). */
export async function getTasksForOnboarding(onboardingId) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const tasks = await prisma.task.findMany({
    where: { onboardingId: id },
    include: { blockedByTask: { select: { id: true, title: true, status: true } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return tasks.map((t) => ({
    id: t.id,
    phaseId: t.phaseId,
    title: t.title,
    status: t.status,
    due: t.due,
    waitingOn: t.waitingOn,
    owner: t.owner,
    notes: t.notes,
    sortOrder: t.sortOrder,
    priority: t.priority || null,
    commentCount: t.commentCount ?? 0,
    previousStatus: t.previousStatus || null,
    blockedByTaskId: t.blockedByTaskId,
    blockedByTask: t.blockedByTask || null,
  }));
}

/** Create a new task. */
export async function createTask(data) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  const phaseId = Number(data.phaseId);
  if (Number.isNaN(phaseId)) {
    throw new Error("Invalid phase ID");
  }

  const maxSort = await prisma.task.aggregate({
    where: { phaseId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const task = await prisma.task.create({
    data: {
      onboardingId,
      phaseId,
      title: data.title || "Untitled task",
      status: data.status || "Not started",
      due: data.due || "",
      waitingOn: data.waitingOn || "",
      owner: data.owner || "",
      notes: data.notes || "",
      sortOrder,
      priority: data.priority || null,
      blockedByTaskId: data.blockedByTaskId ? Number(data.blockedByTaskId) : null,
    },
    include: { blockedByTask: { select: { id: true, title: true, status: true } } },
  });
  return task;
}

/** Update an existing task (partial updates). */
export async function updateTask(id, data) {
  const taskId = Number(id);
  if (Number.isNaN(taskId)) {
    throw new Error("Invalid task ID");
  }

  return await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.due !== undefined && { due: data.due }),
      ...(data.waitingOn !== undefined && { waitingOn: data.waitingOn }),
      ...(data.owner !== undefined && { owner: data.owner }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.commentCount !== undefined && { commentCount: data.commentCount }),
      ...(data.previousStatus !== undefined && { previousStatus: data.previousStatus }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.phaseId !== undefined && { phaseId: Number(data.phaseId) }),
      ...(data.blockedByTaskId !== undefined && {
        blockedByTaskId: data.blockedByTaskId ? Number(data.blockedByTaskId) : null,
      }),
    },
    include: { blockedByTask: { select: { id: true, title: true, status: true } } },
  });
}

/** Delete a task. */
export async function deleteTask(id) {
  const taskId = Number(id);
  if (Number.isNaN(taskId)) {
    throw new Error("Invalid task ID");
  }

  return await prisma.task.delete({
    where: { id: taskId },
  });
}

/** Reorder a task: move to a target phase at a specific sortOrder position. */
export async function reorderTask(taskId, targetPhaseId, newSortOrder) {
  const id = Number(taskId);
  const phaseId = Number(targetPhaseId);
  if (Number.isNaN(id) || Number.isNaN(phaseId)) {
    throw new Error("Invalid task or phase ID");
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error("Task not found");

  const sourcePhaseId = task.phaseId;

  // Shift tasks in target phase to make room
  await prisma.task.updateMany({
    where: {
      phaseId,
      sortOrder: { gte: newSortOrder },
      id: { not: id },
    },
    data: { sortOrder: { increment: 1 } },
  });

  // Move the task
  await prisma.task.update({
    where: { id },
    data: { phaseId, sortOrder: newSortOrder },
  });

  // Re-normalize source phase if task moved to a different phase
  if (sourcePhaseId !== phaseId) {
    const sourceTasks = await prisma.task.findMany({
      where: { phaseId: sourcePhaseId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < sourceTasks.length; i++) {
      await prisma.task.update({
        where: { id: sourceTasks[i].id },
        data: { sortOrder: i },
      });
    }
  }

  return await prisma.task.findUnique({
    where: { id },
    include: { blockedByTask: { select: { id: true, title: true, status: true } } },
  });
}

/** Bulk update multiple tasks (primarily for status changes). */
export async function bulkUpdateTasks(taskIds, data) {
  const validIds = taskIds
    .map(id => Number(id))
    .filter(id => !Number.isNaN(id));

  if (validIds.length === 0) {
    throw new Error("No valid task IDs provided");
  }

  return await prisma.task.updateMany({
    where: { id: { in: validIds } },
    data: {
      ...(data.status !== undefined && { status: data.status }),
    },
  });
}

/** List all companies (for onboarding creation dropdown). */
export async function getCompanies() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
  });
  return companies.map((c) => ({ id: c.id, name: c.name }));
}

/** Create a new company. */
export async function createCompany(name) {
  if (!name || !name.trim()) {
    throw new Error("Company name is required");
  }
  return await prisma.company.create({
    data: { name: name.trim() },
  });
}

/** Create a new onboarding. */
export async function createOnboarding(data) {
  const companyId = Number(data.companyId);
  if (Number.isNaN(companyId)) {
    throw new Error("Invalid company ID");
  }

  return await prisma.onboarding.create({
    data: {
      companyId,
      owner: data.owner || "",
      status: data.status || "Active",
      targetGoLive: data.targetGoLive ? new Date(data.targetGoLive) : null,
      phases: {
        create: DEFAULT_PHASES.map((p) => ({
          name: p.name,
          sortOrder: p.sortOrder,
        })),
      },
    },
    include: { company: true },
  });
}

/** Update an existing onboarding (partial updates). */
export async function updateOnboarding(id, data) {
  const obId = Number(id);
  if (Number.isNaN(obId)) {
    throw new Error("Invalid onboarding ID");
  }

  return await prisma.onboarding.update({
    where: { id: obId },
    data: {
      ...(data.owner !== undefined && { owner: data.owner }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.targetGoLive !== undefined && {
        targetGoLive: data.targetGoLive ? new Date(data.targetGoLive) : null,
      }),
      ...(data.companyId !== undefined && { companyId: Number(data.companyId) }),
    },
    include: { company: true },
  });
}

/** Delete an onboarding and all its tasks (cascade). */
export async function deleteOnboarding(id) {
  const obId = Number(id);
  if (Number.isNaN(obId)) {
    throw new Error("Invalid onboarding ID");
  }

  return await prisma.onboarding.delete({
    where: { id: obId },
  });
}

/** List contacts for an onboarding. */
export async function getContactsForOnboarding(onboardingId) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const contacts = await prisma.contact.findMany({
    where: { onboardingId: id },
    orderBy: { id: "asc" },
  });
  return contacts.map((c) => ({
    id: c.id,
    onboardingId: c.onboardingId,
    name: c.name,
    email: c.email,
    role: c.role,
  }));
}

/** Create a new contact. */
export async function createContact(data) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  return await prisma.contact.create({
    data: {
      onboardingId,
      name: data.name,
      email: data.email || "",
      role: data.role || "",
    },
  });
}

/** Update an existing contact (partial updates). */
export async function updateContact(id, data) {
  const contactId = Number(id);
  if (Number.isNaN(contactId)) {
    throw new Error("Invalid contact ID");
  }
  return await prisma.contact.update({
    where: { id: contactId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.role !== undefined && { role: data.role }),
    },
  });
}

/** Delete a contact. */
export async function deleteContact(id) {
  const contactId = Number(id);
  if (Number.isNaN(contactId)) {
    throw new Error("Invalid contact ID");
  }
  return await prisma.contact.delete({
    where: { id: contactId },
  });
}

/** Duplicate an onboarding with all its tasks and phases. */
export async function duplicateOnboarding(id) {
  const obId = Number(id);
  if (Number.isNaN(obId)) {
    throw new Error("Invalid onboarding ID");
  }

  const original = await prisma.onboarding.findUnique({
    where: { id: obId },
    include: { tasks: true, company: true, phases: { orderBy: { sortOrder: "asc" } } },
  });

  if (!original) {
    throw new Error("Onboarding not found");
  }

  // Create onboarding with duplicated phases
  const newOb = await prisma.onboarding.create({
    data: {
      companyId: original.companyId,
      owner: original.owner,
      status: "Active",
      targetGoLive: null,
      phases: {
        create: original.phases.map((p) => ({
          name: p.name,
          sortOrder: p.sortOrder,
          targetDate: p.targetDate,
        })),
      },
    },
    include: { company: true, phases: { orderBy: { sortOrder: "asc" } } },
  });

  // Build old phaseId → new phaseId map
  const phaseMap = new Map();
  original.phases.forEach((oldPhase, idx) => {
    phaseMap.set(oldPhase.id, newOb.phases[idx].id);
  });

  // Create tasks with mapped phaseIds (no blockedByTaskId copy)
  if (original.tasks.length > 0) {
    await prisma.task.createMany({
      data: original.tasks.map((t) => ({
        onboardingId: newOb.id,
        phaseId: phaseMap.get(t.phaseId) || newOb.phases[0].id,
        title: t.title,
        status: "Not started",
        due: "",
        waitingOn: t.waitingOn,
        owner: t.owner,
        notes: t.notes,
      })),
    });
  }

  return await prisma.onboarding.findUnique({
    where: { id: newOb.id },
    include: { company: true, tasks: true, phases: true },
  });
}

// ── Phase functions ──────────────────────────────────────────────

/** List phases for an onboarding with task counts. */
export async function getPhasesForOnboarding(onboardingId) {
  const id = Number(onboardingId);
  if (Number.isNaN(id)) return [];
  const phases = await prisma.phase.findMany({
    where: { onboardingId: id },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return phases.map((p) => ({
    id: p.id,
    onboardingId: p.onboardingId,
    name: p.name,
    sortOrder: p.sortOrder,
    targetDate: p.targetDate ? p.targetDate.toISOString() : null,
    isComplete: p.isComplete,
    taskCount: p._count.tasks,
    doneCount: p.tasks.filter((t) => t.status === "Done").length,
  }));
}

/** Create a new phase. */
export async function createPhase(data) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }
  const phase = await prisma.phase.create({
    data: {
      onboardingId,
      name: data.name || "New Phase",
      sortOrder: data.sortOrder ?? 0,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
    },
  });
  return {
    id: phase.id,
    onboardingId: phase.onboardingId,
    name: phase.name,
    sortOrder: phase.sortOrder,
    targetDate: phase.targetDate ? phase.targetDate.toISOString() : null,
    isComplete: phase.isComplete,
    taskCount: 0,
    doneCount: 0,
  };
}

/** Update an existing phase (partial updates). */
export async function updatePhase(id, data) {
  const phaseId = Number(id);
  if (Number.isNaN(phaseId)) {
    throw new Error("Invalid phase ID");
  }
  const phase = await prisma.phase.update({
    where: { id: phaseId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.targetDate !== undefined && {
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
      }),
      ...(data.isComplete !== undefined && { isComplete: data.isComplete }),
    },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
  });
  return {
    id: phase.id,
    onboardingId: phase.onboardingId,
    name: phase.name,
    sortOrder: phase.sortOrder,
    targetDate: phase.targetDate ? phase.targetDate.toISOString() : null,
    isComplete: phase.isComplete,
    taskCount: phase._count.tasks,
    doneCount: phase.tasks.filter((t) => t.status === "Done").length,
  };
}

/** Delete a phase (only if no tasks remain). */
export async function deletePhase(id) {
  const phaseId = Number(id);
  if (Number.isNaN(phaseId)) {
    throw new Error("Invalid phase ID");
  }
  const count = await prisma.task.count({ where: { phaseId } });
  if (count > 0) {
    throw new Error("Cannot delete phase with tasks. Move or delete tasks first.");
  }
  return await prisma.phase.delete({ where: { id: phaseId } });
}
