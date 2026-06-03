/**
 * AI-draft test fixtures for Playwright e2e.
 *
 * ADDITIVE + SELF-CLEANING. Never wipes real data. Everything it creates is
 * tagged so it can be removed again:
 *   - PendingAIChange rows carry sourceUrl === FIXTURE_TAG
 *   - Tasks it (or an approve test) creates have titles starting with MARKER
 *
 * Usage:
 *   npx tsx prisma/seed-ai-test-fixtures.js          # clean old fixtures, then seed fresh
 *   npx tsx prisma/seed-ai-test-fixtures.js --clean  # remove fixtures + fixture-created tasks only
 *
 * Targets the Acme Co onboarding (prefix AC). Resolved by prefix, not a
 * hardcoded id, so it survives a reseed.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const MARKER = "[PWTEST]";
export const FIXTURE_TAG = "test://pwtest";

export const TITLES = {
  edit: `${MARKER} Draft security questionnaire response`,
  editApplied: `${MARKER} EDITED security questionnaire response`,
  bulkA: `${MARKER} Bulk reject candidate A`,
  bulkB: `${MARKER} Bulk reject candidate B`,
  bulkC: `${MARKER} Bulk reject candidate C`,
  control: `${MARKER} Control draft (never touched)`,
};

async function resolveTarget() {
  const company = await prisma.company.findFirst({
    where: { prefix: "AC" },
    include: { onboardings: { include: { phases: { orderBy: { sortOrder: "asc" } } }, take: 1 } },
  });
  if (!company) throw new Error("Acme Co (prefix AC) not found — run `npm run seed` first.");
  const onboarding = company.onboardings[0];
  if (!onboarding) throw new Error("Acme Co has no onboarding.");
  const phase = onboarding.phases[0];
  if (!phase) throw new Error("Acme onboarding has no phases.");
  return { companyId: company.id, onboardingId: onboarding.id, phaseId: phase.id };
}

async function clean(onboardingId) {
  // Delete fixture drafts (tagged via sourceUrl).
  const delDrafts = await prisma.pendingAIChange.deleteMany({ where: { sourceUrl: FIXTURE_TAG } });
  // Delete any tasks an approve test created (tagged via MARKER title prefix).
  const delTasks = await prisma.task.deleteMany({
    where: { onboardingId, title: { startsWith: MARKER } },
  });
  return { drafts: delDrafts.count, tasks: delTasks.count };
}

function createTaskDraft({ onboardingId, phaseId, title, confidence = "medium" }) {
  return {
    source: "miniti",
    onboardingId,
    action: "create_task",
    confidence,
    status: "pending",
    sourceUrl: FIXTURE_TAG,
    sourceQuote: `${MARKER} "${title}" — fixture for automated tests.`,
    payload: {
      title,
      description: "Auto-generated Playwright fixture. Safe to delete.",
      owner: "vendor",
      priority: "medium",
      dueDate: "",
      phaseId,
    },
  };
}

async function main() {
  const mode = process.argv.includes("--clean") ? "clean" : "seed";
  const { onboardingId, phaseId } = await resolveTarget();

  const cleaned = await clean(onboardingId);

  if (mode === "clean") {
    console.log(JSON.stringify({ mode, onboardingId, cleaned }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const drafts = [
    createTaskDraft({ onboardingId, phaseId, title: TITLES.edit, confidence: "high" }),
    createTaskDraft({ onboardingId, phaseId, title: TITLES.bulkA }),
    createTaskDraft({ onboardingId, phaseId, title: TITLES.bulkB }),
    createTaskDraft({ onboardingId, phaseId, title: TITLES.bulkC }),
    createTaskDraft({ onboardingId, phaseId, title: TITLES.control }),
  ];

  const created = [];
  for (const d of drafts) {
    const row = await prisma.pendingAIChange.create({ data: d });
    created.push({ id: row.id, title: d.payload.title });
  }

  console.log(JSON.stringify({ mode, onboardingId, phaseId, cleaned, created }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
