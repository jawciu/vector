/**
 * AI-draft test fixtures for Playwright e2e.
 *
 * ADDITIVE + SELF-CLEANING. Never wipes real data. Everything it creates is
 * tagged so it can be removed again:
 *   - PendingAIChange rows carry sourceUrl === FIXTURE_TAG
 *   - Tasks it (or an approve test) creates have titles starting with MARKER
 *     (including the target task of the multi-field update fixture)
 *
 * Usage:
 *   npx tsx prisma/seed-ai-test-fixtures.js          # clean old fixtures, then seed fresh
 *   npx tsx prisma/seed-ai-test-fixtures.js --clean  # remove fixtures + fixture-created tasks only
 *
 * Target resolution is dynamic: the first Active onboarding (lowest id) that
 * has at least one phase and one task. The resolved target is written to
 * e2e/.auth/target.json so the Playwright specs assert against the same
 * company. Override with E2E_TARGET_PREFIX=XX to pin a specific company.
 * Dynamic so archiving an onboarding (e.g. the original Acme corpus) retargets
 * the tests automatically instead of breaking them.
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
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
  updateTarget: `${MARKER} Update target task`,
};

/** The multi-field existing-task update fixture (e2e/ai-drafts.spec.ts). */
export const UPDATE_FIXTURE = {
  originalNotes: "Original note written on the board.",
  originalDue: "2026-06-10",
  changes: {
    dueDate: "2026-07-01",
    priority: "high",
    appendNotes: "Scope agreed on the call: billing reports only.",
  },
  // The meeting day + source the appended note is stamped with.
  noteSource: { date: "2026-06-18", label: "call with fixture" },
};

async function resolveTarget() {
  const pinnedPrefix = process.env.E2E_TARGET_PREFIX;
  const onboarding = await prisma.onboarding.findFirst({
    where: {
      status: "Active",
      phases: { some: {} },
      tasks: { some: {} },
      ...(pinnedPrefix ? { company: { prefix: pinnedPrefix } } : {}),
    },
    orderBy: { id: "asc" },
    include: { company: true, phases: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  if (!onboarding) {
    throw new Error(
      pinnedPrefix
        ? `No Active onboarding with phases + tasks for prefix ${pinnedPrefix}.`
        : "No Active onboarding with phases + tasks found — run `npm run seed` first."
    );
  }
  const target = {
    companyId: onboarding.companyId,
    prefix: onboarding.company.prefix,
    onboardingId: onboarding.id,
    phaseId: onboarding.phases[0].id,
  };
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync("e2e/.auth/target.json", JSON.stringify(target, null, 2));
  return target;
}

async function clean() {
  // Delete fixture drafts (tagged via sourceUrl).
  const delDrafts = await prisma.pendingAIChange.deleteMany({ where: { sourceUrl: FIXTURE_TAG } });
  // Delete any tasks an approve test created (tagged via MARKER title prefix) —
  // across ALL onboardings, so leftovers on a previously-targeted onboarding
  // still get removed after a retarget.
  const delTasks = await prisma.task.deleteMany({
    where: { title: { startsWith: MARKER } },
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

/**
 * A fixture task (MARKER title, so clean() deletes it) for the existing-task
 * update draft to target. Never points an update draft at a real task.
 * Same atomic counter bump as lib/db.ts createTask.
 */
async function createTargetTask({ onboardingId, phaseId }) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      WITH ob AS (SELECT "companyId" FROM "Onboarding" WHERE id = ${onboardingId}),
      mx AS (
        SELECT COALESCE(MAX(t."number"), 0) AS max_n
          FROM "Task" t JOIN "Onboarding" o ON o.id = t."onboardingId"
         WHERE o."companyId" = (SELECT "companyId" FROM ob)
      ),
      upd AS (
        UPDATE "Company" SET "taskCounter" = GREATEST("taskCounter", (SELECT max_n FROM mx)) + 1
         WHERE id = (SELECT "companyId" FROM ob)
         RETURNING "taskCounter", id
      )
      SELECT "taskCounter" AS "number", id AS "companyId" FROM upd;
    `;
    return tx.task.create({
      data: {
        onboardingId,
        phaseId,
        title: TITLES.updateTarget,
        description: "Auto-generated Playwright fixture. Safe to delete.",
        status: "Not started",
        due: UPDATE_FIXTURE.originalDue,
        priority: "low",
        notes: UPDATE_FIXTURE.originalNotes,
        number: Number(rows[0].number),
        companyId: Number(rows[0].companyId),
      },
    });
  });
}

/** A current-shape match_existing draft: several changes in one update. */
function updateTaskDraft({ onboardingId, taskId }) {
  return {
    source: "miniti",
    onboardingId,
    action: "match_existing",
    confidence: "high",
    status: "pending",
    sourceUrl: FIXTURE_TAG,
    sourceQuote: `${MARKER} "${TITLES.updateTarget}" — multi-field update fixture for automated tests.`,
    payload: { taskId, action: "update", changes: UPDATE_FIXTURE.changes, noteSource: UPDATE_FIXTURE.noteSource },
  };
}

async function main() {
  const mode = process.argv.includes("--clean") ? "clean" : "seed";
  const { onboardingId, phaseId } = await resolveTarget();

  const cleaned = await clean();

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

  const target = await createTargetTask({ onboardingId, phaseId });
  drafts.push(updateTaskDraft({ onboardingId, taskId: target.id }));

  const created = [];
  for (const d of drafts) {
    const row = await prisma.pendingAIChange.create({ data: d });
    created.push({ id: row.id, title: d.payload.title ?? `update of task ${target.id}` });
  }

  console.log(JSON.stringify({ mode, onboardingId, phaseId, cleaned, created }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
