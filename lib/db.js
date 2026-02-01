/**
 * Postgres read layer via Prisma.
 * Singleton client for Next.js; helpers match the shape lib/data.js used.
 */

import { PrismaClient } from "./generated/prisma/client";
import { computeHealth as computeHealthFromTasks } from "./health.js";

const globalForPrisma = typeof globalThis !== "undefined" ? globalThis : {};
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const STATUSES = ["Todo", "In progress", "Blocked", "Done"];

/** List onboardings with company name, health, blocked count, task count. */
export async function getOnboardings() {
  const list = await prisma.onboarding.findMany({
    include: {
      company: true,
      tasks: true,
    },
    orderBy: { id: "asc" },
  });
  return list.map((ob) => {
    const health = computeHealthFromTasks(ob.tasks);
    const blockedCount = ob.tasks.filter((t) => t.status === "Blocked").length;
    return {
      id: String(ob.id),
      companyName: ob.company.name,
      health,
      blockedCount,
      taskCount: ob.tasks.length,
    };
  });
}

/** Single onboarding by id (for detail page). */
export async function getOnboarding(id) {
  const ob = await prisma.onboarding.findUnique({
    where: { id: id === undefined ? undefined : Number(id) },
    include: { company: true },
  });
  if (!ob) return null;
  return {
    id: String(ob.id),
    companyName: ob.company.name,
  };
}

/** Tasks for one onboarding (for detail page). */
export async function getTasksForOnboarding(onboardingId) {
  const tasks = await prisma.task.findMany({
    where: { onboardingId: Number(onboardingId) },
    orderBy: { id: "asc" },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due: t.due,
    waitingOn: t.waitingOn,
  }));
}
