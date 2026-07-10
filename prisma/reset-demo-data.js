/**
 * DEMO DATA ONLY — nightly reset for the public demo at vector.quest.
 *
 * vector.quest auto-signs visitors into a shared demo account with full write
 * access, so anyone can drag cards, edit tasks, and approve AI drafts. This
 * script puts the portfolio back the way it started, so whatever a visitor
 * changes is gone by morning.
 *
 * SCOPE — it deletes ONLY the companies created by seed-portfolio-growth.js,
 * identified by `logoUrl IS NOT NULL`. The original demo corpus (Acme Co and
 * friends, all `logoUrl = null`) is never touched, nor is anything a human
 * created outside those 12 companies. Deletion cascades to onboardings, tasks,
 * phases, contacts, comments, files, activity, external events and AI drafts.
 *
 * A real product would never wipe and re-create customer records on a timer.
 * This exists purely so the portfolio self-heals after strangers poke at it.
 *
 * Usage:
 *   npx tsx prisma/reset-demo-data.js            # dry run — reports, writes nothing
 *   npx tsx prisma/reset-demo-data.js --write    # delete seeded companies, then reseed
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const WRITE = process.argv.includes("--write");

async function main() {
  const seeded = await prisma.company.findMany({
    where: { NOT: { logoUrl: null } },
    select: { id: true, name: true, _count: { select: { onboardings: true, tasks: true } } },
    orderBy: { id: "asc" },
  });

  if (seeded.length === 0) {
    console.log("No seeded companies found — nothing to reset. Reseeding from scratch.");
  } else {
    console.log(`${WRITE ? "Deleting" : "Would delete"} ${seeded.length} seeded companies:`);
    for (const c of seeded) {
      console.log(`  - ${c.name} (${c._count.onboardings} onboardings, ${c._count.tasks} tasks)`);
    }
  }

  const legacy = await prisma.company.count({ where: { logoUrl: null } });
  console.log(`\nPreserved (never touched): ${legacy} legacy companies.`);

  if (!WRITE) {
    console.log("\nDRY RUN — nothing was written. Re-run with --write to reset.");
    await prisma.$disconnect();
    return;
  }

  if (seeded.length > 0) {
    const ids = seeded.map((c) => c.id);
    // Order matters: Task.companyId is ON DELETE NO ACTION, so a company can't be
    // removed while its tasks exist. Deleting the onboardings first cascades away
    // their tasks (Task.onboardingId is ON DELETE CASCADE), which frees the company.
    const obs = await prisma.onboarding.deleteMany({ where: { companyId: { in: ids } } });
    const { count } = await prisma.company.deleteMany({ where: { id: { in: ids } } });
    console.log(`\nDeleted ${obs.count} onboardings (cascading their tasks) and ${count} companies.`);
  }

  // Re-run the growth seed. It is additive + idempotent, so with the seeded
  // companies gone it recreates the full portfolio with dates relative to today.
  console.log("Reseeding…\n");
  execSync("npx tsx prisma/seed-portfolio-growth.js --write", { stdio: "inherit" });

  const after = await prisma.company.count({ where: { NOT: { logoUrl: null } } });
  console.log(`\nReset complete. ${after} seeded companies restored.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
