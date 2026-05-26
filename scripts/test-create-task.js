// One-off verification for Phase 4a: confirm createTask atomically
// assigns companyId + number, and that mapTask composes taskId from
// company.prefix + number. Creates one test task, prints what we got,
// then deletes it so no leftover state pollutes the DB.
//
// Run: npx tsx scripts/test-create-task.js

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { createTask } from "../lib/db.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const onboarding = await prisma.onboarding.findFirst({
    orderBy: { id: "asc" },
    include: {
      company: { select: { id: true, name: true, prefix: true, taskCounter: true } },
      phases: { orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });
  if (!onboarding) throw new Error("No onboardings found.");
  if (!onboarding.phases[0]) throw new Error(`Onboarding ${onboarding.id} has no phases.`);

  const beforeMaxRow = await prisma.task.aggregate({
    where: { companyId: onboarding.company.id },
    _max: { number: true },
  });
  const beforeMax = beforeMaxRow._max.number ?? 0;

  console.log("Before:");
  console.log("  onboarding.id        =", onboarding.id);
  console.log("  onboarding.companyId =", onboarding.companyId);
  console.log("  company.name         =", onboarding.company.name);
  console.log("  company.prefix       =", onboarding.company.prefix);
  console.log("  company.taskCounter  =", onboarding.company.taskCounter);
  console.log("  max(Task.number)     =", beforeMax);

  const created = await createTask({
    onboardingId: onboarding.id,
    phaseId: onboarding.phases[0].id,
    title: "[phase-4a verification — delete me]",
  });
  console.log("\nCreated task:");
  console.log("  id        =", created.id);
  console.log("  companyId =", created.companyId);
  console.log("  number    =", created.number);
  console.log("  taskId    =", created.taskId);

  // Re-fetch from DB to confirm persisted state matches.
  const row = await prisma.task.findUnique({ where: { id: created.id } });
  console.log("\nDB row:");
  console.log("  companyId =", row.companyId);
  console.log("  number    =", row.number);

  const expectedNumber = beforeMax + 1;
  const expectedTaskId = `${onboarding.company.prefix}-${expectedNumber}`;

  const checks = [
    ["companyId matches onboarding.companyId", row.companyId === onboarding.companyId],
    [`number is previous max + 1 (= ${expectedNumber})`, row.number === expectedNumber],
    [`taskId is "${expectedTaskId}"`, created.taskId === expectedTaskId],
  ];
  console.log("\nChecks:");
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "[ok]" : "[FAIL]"} ${label}`);
  }
  const allOk = checks.every(([, ok]) => ok);

  // Clean up.
  await prisma.task.delete({ where: { id: created.id } });
  // Also roll back the counter so we don't leave a gap.
  await prisma.company.update({
    where: { id: onboarding.company.id },
    data: { taskCounter: { decrement: 1 } },
  });
  console.log("\nDeleted test task and decremented taskCounter.");

  if (!allOk) process.exit(1);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
