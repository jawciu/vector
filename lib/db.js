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
  }));
}
