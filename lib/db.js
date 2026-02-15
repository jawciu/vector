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

export const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

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
      tasks: true,
    },
    orderBy: { id: "asc" },
  });
  return list.map((ob) => {
    const health = computeHealthFromTasks(ob.tasks);
    const blockedCount = ob.tasks.filter((t) => t.status === "Blocked").length;
    const nextTask = ob.tasks.find(
      (t) => t.status !== "Done" && t.status !== "Blocked"
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
    orderBy: { id: "asc" },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due: t.due,
    waitingOn: t.waitingOn,
    owner: t.owner,
    notes: t.notes,
  }));
}

/** Create a new task. */
export async function createTask(data) {
  const onboardingId = Number(data.onboardingId);
  if (Number.isNaN(onboardingId)) {
    throw new Error("Invalid onboarding ID");
  }

  return await prisma.task.create({
    data: {
      onboardingId,
      title: data.title || "Untitled task",
      status: data.status || "Todo",
      due: data.due || "",
      waitingOn: data.waitingOn || "",
      owner: data.owner || "",
      notes: data.notes || "",
    },
  });
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
    },
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

/** Duplicate an onboarding with all its tasks. */
export async function duplicateOnboarding(id) {
  const obId = Number(id);
  if (Number.isNaN(obId)) {
    throw new Error("Invalid onboarding ID");
  }

  const original = await prisma.onboarding.findUnique({
    where: { id: obId },
    include: { tasks: true, company: true },
  });

  if (!original) {
    throw new Error("Onboarding not found");
  }

  return await prisma.onboarding.create({
    data: {
      companyId: original.companyId,
      owner: original.owner,
      status: "Active",
      targetGoLive: null,
      tasks: {
        create: original.tasks.map((t) => ({
          title: t.title,
          status: "Todo",
          due: "",
          waitingOn: t.waitingOn,
          owner: t.owner,
          notes: t.notes,
        })),
      },
    },
    include: { company: true, tasks: true },
  });
}
