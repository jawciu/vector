// Backfill script for Task IDs.
//
// Phase A: assign Company.prefix to companies that don't have one.
// Phase B: assign per-company sequential Task.number + Task.companyId to
//          tasks that don't have them.
// Phase C: sync Company.taskCounter to max(Task.number) for each company.
//
// Idempotent. Pass --dry-run to print what would happen without writing.
//
// Run: npx tsx scripts/backfill-task-ids.js [--dry-run]

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { derivePrefix } from "../lib/companies.js";

const dryRun = process.argv.includes("--dry-run");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(
    dryRun
      ? "[DRY RUN] no writes will be made"
      : "[LIVE RUN] writing changes"
  );

  // ─── PHASE A: company prefixes ────────────────────────────────────────
  console.log("\n═══ PHASE A: company prefixes ═══");
  const companies = await prisma.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, prefix: true },
  });

  const taken = new Set(companies.map((c) => c.prefix).filter(Boolean));
  let prefixAssigned = 0;
  let prefixSkipped = 0;

  for (const c of companies) {
    if (c.prefix) {
      prefixSkipped++;
      console.log(`  Company#${c.id} "${c.name}" → already has prefix=${c.prefix}, skipping`);
      continue;
    }
    const newPrefix = derivePrefix(c.name, taken);
    taken.add(newPrefix);
    prefixAssigned++;
    console.log(`  Company#${c.id} "${c.name}" → prefix=${newPrefix}`);
    if (!dryRun) {
      await prisma.company.update({
        where: { id: c.id },
        data: { prefix: newPrefix },
      });
    }
  }
  console.log(
    `Phase A summary: ${prefixAssigned} assigned, ${prefixSkipped} already had a prefix.`
  );

  // ─── PHASE B: task numbers ────────────────────────────────────────────
  console.log("\n═══ PHASE B: task numbers ═══");

  // Consistency guard: refuse to run if some tasks are half-backfilled
  // (number set but companyId NULL, or vice versa).
  const inconsistent = await prisma.task.findMany({
    where: {
      OR: [
        { number: { not: null }, companyId: null },
        { number: null, companyId: { not: null } },
      ],
    },
    select: { id: true, number: true, companyId: true },
  });
  if (inconsistent.length > 0) {
    console.error(
      `Refusing to run: found ${inconsistent.length} task(s) in inconsistent state ` +
        `(number/companyId partially set). Offending IDs:`
    );
    for (const t of inconsistent) {
      console.error(`  Task#${t.id} number=${t.number} companyId=${t.companyId}`);
    }
    process.exit(1);
  }

  // Re-read companies so we know their current prefix (post-Phase A).
  const companiesPostA = await prisma.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, prefix: true },
  });

  let totalTasksAssigned = 0;
  let totalTasksSkipped = 0;
  let totalTasksWarned = 0;

  for (const c of companiesPostA) {
    const tasks = await prisma.task.findMany({
      where: { onboarding: { companyId: c.id } },
      orderBy: { id: "asc" },
      select: { id: true, number: true, companyId: true },
    });

    if (tasks.length === 0) {
      console.log(`  Company#${c.id} "${c.name}": no tasks`);
      continue;
    }

    // Compute starting number from any pre-existing numbers in this batch.
    const existingNumbers = tasks
      .map((t) => t.number)
      .filter((n) => n !== null && n !== undefined);
    let nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

    let assignedHere = 0;
    let firstAssigned = null;
    let lastAssigned = null;

    for (const t of tasks) {
      const hasNumber = t.number !== null && t.number !== undefined;
      const hasCompanyId = t.companyId !== null && t.companyId !== undefined;

      if (hasNumber && hasCompanyId) {
        if (t.companyId !== c.id) {
          // Inconsistency: task is reachable via this company's onboarding
          // but its denormalized companyId points elsewhere. Don't fix
          // silently — log and skip.
          console.warn(
            `  ⚠️  Task#${t.id}: companyId=${t.companyId} but reached via Company#${c.id} ` +
              `via onboarding. Skipping — please investigate manually.`
          );
          totalTasksWarned++;
        } else {
          totalTasksSkipped++;
        }
        continue;
      }

      // hasNumber XOR hasCompanyId would have been caught by the guard above,
      // so at this point both are null.
      const assignNumber = nextNumber++;
      if (firstAssigned === null) firstAssigned = assignNumber;
      lastAssigned = assignNumber;
      assignedHere++;

      console.log(`    Task#${t.id} → companyId=${c.id}, number=${assignNumber}`);
      if (!dryRun) {
        await prisma.task.update({
          where: { id: t.id },
          data: { companyId: c.id, number: assignNumber },
        });
      }
    }

    totalTasksAssigned += assignedHere;
    if (assignedHere === 0) {
      console.log(`  Company#${c.id} "${c.name}": no new tasks needed`);
    } else {
      console.log(
        `  Company#${c.id} "${c.name}": assigned ${assignedHere} task numbers, range ${firstAssigned}..${lastAssigned}`
      );
    }
  }
  console.log(
    `Phase B summary: ${totalTasksAssigned} tasks assigned, ${totalTasksSkipped} already complete, ${totalTasksWarned} warnings.`
  );

  // ─── PHASE C: counter sync ────────────────────────────────────────────
  console.log("\n═══ PHASE C: counter sync ═══");
  for (const c of companiesPostA) {
    if (!dryRun) {
      await prisma.$executeRaw`
        UPDATE "Company" c
        SET "taskCounter" = GREATEST(c."taskCounter", COALESCE((
          SELECT MAX(t."number")
          FROM "Task" t
          JOIN "Onboarding" o ON o.id = t."onboardingId"
          WHERE o."companyId" = c.id
        ), 0))
        WHERE c.id = ${c.id}
      `;
    }
    // Read back the current state for logging (in dry-run, this shows the
    // pre-update value; in live, post-update).
    const post = await prisma.company.findUnique({
      where: { id: c.id },
      select: { taskCounter: true },
    });
    const maxNumRow = await prisma.$queryRaw`
      SELECT COALESCE(MAX(t."number"), 0) AS max
      FROM "Task" t
      JOIN "Onboarding" o ON o.id = t."onboardingId"
      WHERE o."companyId" = ${c.id}
    `;
    const maxNum = Number(maxNumRow?.[0]?.max ?? 0);
    console.log(
      `  Company#${c.id} "${c.name}": taskCounter=${post?.taskCounter ?? "(unknown)"}, max(task.number)=${maxNum}`
    );
  }

  // ─── SANITY CHECKS ────────────────────────────────────────────────────
  console.log("\n═══ SANITY CHECKS ═══");

  const nullTaskCountRow = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "Task"
    WHERE "number" IS NULL OR "companyId" IS NULL
  `;
  const nullTaskCount = Number(nullTaskCountRow?.[0]?.count ?? 0);
  const nullTaskOk = nullTaskCount === 0;
  console.log(
    `  Tasks with NULL number or companyId: ${nullTaskCount} ${nullTaskOk ? "✓" : "✗ EXPECTED 0"}`
  );

  const nullPrefixRow = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "Company"
    WHERE "prefix" IS NULL
  `;
  const nullPrefixCount = Number(nullPrefixRow?.[0]?.count ?? 0);
  const nullPrefixOk = nullPrefixCount === 0;
  console.log(
    `  Companies with NULL prefix: ${nullPrefixCount} ${nullPrefixOk ? "✓" : "✗ EXPECTED 0"}`
  );

  const dupTaskRows = await prisma.$queryRaw`
    SELECT "companyId", "number", COUNT(*)::int AS count
    FROM "Task"
    WHERE "companyId" IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  `;
  const dupTaskOk = dupTaskRows.length === 0;
  console.log(
    `  Duplicate (companyId, number) rows: ${dupTaskRows.length} ${dupTaskOk ? "✓" : "✗ EXPECTED 0"}`
  );
  if (!dupTaskOk) {
    for (const row of dupTaskRows) {
      console.log(`    companyId=${row.companyId} number=${row.number} count=${row.count}`);
    }
  }

  const dupPrefixRows = await prisma.$queryRaw`
    SELECT prefix, COUNT(*)::int AS count
    FROM "Company"
    WHERE prefix IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) > 1
  `;
  const dupPrefixOk = dupPrefixRows.length === 0;
  console.log(
    `  Duplicate prefixes: ${dupPrefixRows.length} ${dupPrefixOk ? "✓" : "✗ EXPECTED 0"}`
  );
  if (!dupPrefixOk) {
    for (const row of dupPrefixRows) {
      console.log(`    prefix=${row.prefix} count=${row.count}`);
    }
  }

  if (!dryRun) {
    const allOk = nullTaskOk && nullPrefixOk && dupTaskOk && dupPrefixOk;
    if (!allOk) {
      console.error(
        "\n‼️  One or more sanity checks FAILED. Migration 3 will fail until these are resolved."
      );
    } else {
      console.log("\nAll sanity checks passed. Ready for migration 3.");
    }
  } else {
    console.log(
      "\n(Dry run — sanity checks above reflect pre-backfill state, not what live would produce.)"
    );
  }
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
