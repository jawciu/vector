/**
 * demo-pair-dryrun.mjs — the nightly pair (date shift, then restore-state) run
 * end to end inside ONE transaction that is always rolled back. Nothing is
 * written. Run it before re-enabling demo-drift-check.yml or after touching
 * either script:
 *
 *   node --import ./scripts/node-resolve-ts.mjs scripts/demo-pair-dryrun.mjs
 *
 * What it proves:
 *   - the shift SQL leaves every NULL timestamp NULL (links stay live, unread
 *     notifications stay unread, ambiguous events stay unprocessed);
 *   - the REAL restore planner, run against the shifted snapshot and the
 *     shifted live rows, plans nothing beyond genuine visitor drift. If it
 *     lists "created after the baseline" deletes for seeded rows, the two
 *     scripts have drifted apart again: do not enable the workflow.
 *
 * Why the resolve hook: demo-date-shift.mjs runs under plain node and
 * demo-snapshot.js under tsx; this harness needs both, and plain node cannot
 * resolve the generated client's extensionless import without the hook.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { planRestoreState } from "../scripts/demo-snapshot.js";
import { statements, compile, shiftSnapshot, resolveAnchor, daysBetweenUTC, isoDate } from "../scripts/demo-date-shift.mjs";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const snapshot = JSON.parse(readFileSync("prisma/fixtures/demo-snapshot.json", "utf8"));
const anchor = resolveAnchor(snapshot);
const today = isoDate(new Date());
const delta = daysBetweenUTC(anchor, today);
console.log(`anchor ${anchor} → today ${today}, delta ${delta}`);
if (delta <= 0) { console.log("delta 0: nothing to test today"); process.exit(0); }

const SEEDED = { logoUrl: { not: null } };
const include = { onboardings: { orderBy: { createdAt: "asc" }, include: {
  ownerUser: { select: { email: true } }, phases: { orderBy: { sortOrder: "asc" } }, contacts: { orderBy: { email: "asc" } },
  magicLinks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { contact: { select: { email: true } } } },
  files: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  activities: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { notifications: { orderBy: { id: "asc" } } } },
  pendingChanges: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { sourceEvent: { select: { sourceId: true } } } },
  tasks: { orderBy: { number: "asc" }, include: { phase: { select: { name: true } }, blockedByTask: { select: { number: true } }, ownerUser: { select: { email: true } }, assigneeContact: { select: { email: true } }, comments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
} } };
const nullCounts = async (db) => ({
  linksUnrevoked: await db.magicLink.count({ where: { revokedAt: null } }),
  linksNeverUsed: await db.magicLink.count({ where: { lastUsedAt: null } }),
  notifUnread: await db.notification.count({ where: { readAt: null } }),
  notifUnarchived: await db.notification.count({ where: { archivedAt: null } }),
  eventsUnprocessed: await db.externalEvent.count({ where: { processedAt: null } }),
});

const light = await prisma.company.findMany({ where: SEEDED, select: { id: true, prefix: true, onboardings: { select: { id: true } } } });
const ctx = { delta, anchor: new Date(`${anchor}T23:59:59.999Z`), obIds: light.flatMap((c) => c.onboardings.map((o) => o.id)), companyIds: light.map((c) => c.id), fixtureIds: [] };
const stmts = statements().map((s) => ({ ...s, ...compile(s.sql, ctx) }));
const before = await nullCounts(prisma);

let out;
try {
  await prisma.$transaction(async (tx) => {
    const rows = {};
    for (const s of stmts) rows[s.table] = await tx.$executeRawUnsafe(s.sql, ...s.params);
    const after = await nullCounts(tx);
    const [companies, vendors] = await Promise.all([
      tx.company.findMany({ where: SEEDED, orderBy: { prefix: "asc" }, include }),
      tx.vendorUser.findMany({ select: { id: true, email: true } }),
    ]);
    const plan = planRestoreState(shiftSnapshot(snapshot, delta, today), companies, { vendorByEmail: new Map(vendors.map((v) => [v.email, v.id])) });
    const byOp = {};
    for (const op of plan.ops) byOp[`${op.table} ${op.verb}`] = (byOp[`${op.table} ${op.verb}`] ?? 0) + 1;
    out = { rowsShifted: rows, nullColumns: { before, after }, restorePlanOps: plan.ops.length, restorePlanByOp: byOp, sample: plan.ops.slice(0, 8).map((o) => `${o.table} ${o.verb}: ${o.label}`) };
    throw new Error("ROLLBACK");
  }, { timeout: 180000 });
} catch (e) { if (e.message !== "ROLLBACK") throw e; }
const afterRollback = await nullCounts(prisma);
console.log(JSON.stringify(out, null, 1));
console.log("rolled back, live unchanged:", JSON.stringify(afterRollback) === JSON.stringify(before));
await prisma.$disconnect();
