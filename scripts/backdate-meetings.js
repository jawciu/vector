/**
 * backdate-meetings.js — phase 2 of the meeting seed (run AFTER inject-meetings.js).
 *
 * DEMO DATA ONLY: this script fabricates timestamps (ExternalEvent.receivedAt /
 * processedAt, PendingAIChange.createdAt / resolvedAt, and the createdAt of tasks
 * created by approving a draft) relative to each meeting's occurredAt so the
 * pipeline history looks like it accrued over the last couple of months. A real
 * product would NEVER backdate these — they're write-once fields the DB sets at
 * insert time. This exists purely so the demo portfolio reads as "recently alive".
 *
 * What it does:
 *   1. For every miniti ExternalEvent, pull receivedAt (and processedAt, when the
 *      event was actually processed) back to ≈ occurredAt. Ambiguous / unprocessed
 *      events keep processedAt = null so the "Needs your input" queue stays honest.
 *   2. For drafts belonging to meetings older than ~14 days (and never the newest
 *      few meetings), resolve them the way Caroline would have back then, mirroring
 *      the /api/ai-drafts/[id]/approve route's effects:
 *        - ~80% approved-then-applied. create_task drafts actually create a Task
 *          (correct per-company number + companyId via the counter pattern, with a
 *          backdated createdAt + appliedTaskId). A few carry an edit override
 *          (edited-then-approved). match_existing / update_status / draft_followup
 *          apply their underlying updateTask / createComment effect.
 *        - ~20% rejected with a plausible rejectedReason.
 *      PendingAIChange.createdAt/resolvedAt are backdated near the meeting date.
 *      Each applied draft also writes backdated ActivityLog rows mirroring what
 *      the approve route's createTask/updateTask/createComment { actor } calls
 *      emit (created / assigned / status_changed / completed / commented), so
 *      the onboarding activity feed + audit timeline read as alive. These are
 *      written directly (not via emitActivity) so createdAt can be backdated and
 *      so no real customer emails fire; see emitBackdatedActivity below. The
 *      health_flipped verb is deliberately not reconstructed.
 *   3. Drafts from the newest ~3 meetings stay pending so /ai-drafts has a live inbox.
 *
 * SAFETY: DEFAULTS TO DRY-RUN. It prints exactly what it would change and writes
 * nothing unless you pass --write. Idempotent: only pending drafts are resolved and
 * event backdating is a fixed target, so re-running is safe.
 *
 *   node scripts/backdate-meetings.js            # dry run (default) — prints the plan
 *   node scripts/backdate-meetings.js --write    # actually mutate the shared DB
 *
 * Env: DATABASE_URL (same as the app).
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const WRITE = process.argv.includes("--write");

// Tuning knobs.
const CUTOFF_DAYS = 14;        // only resolve drafts from meetings older than this
const NEWEST_PENDING = 3;      // ...and never the newest N meetings, whatever their age
const REJECT_EVERY = 5;        // draft.id % 5 === 0 → reject (~20%); else approve (~80%)
const OVERRIDE_EVERY = 4;      // among approvals, id % 4 === 0 → edited-then-approved

const DAY_MS = 86400000;

const REJECT_REASONS = [
  "Already tracked under an existing task",
  "Discussed but not actioned — no owner committed on the call",
  "Duplicate of another draft from the same meeting",
  "Superseded by a later decision",
  "Not a concrete action item on a second read",
];

const iso = (d) => (d instanceof Date ? d.toISOString() : d);
const addMs = (date, ms) => new Date(new Date(date).getTime() + ms);
const daysBetween = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;

// ── Timestamp model for a resolved draft ─────────────────────────────────────
// Orchestrator produced the draft shortly after the meeting; Caroline reviewed it
// a day or two later. Both clamped so nothing lands in the future.
function draftTimestamps(occurredAt, draftId, now) {
  const created = addMs(occurredAt, 25 * 60 * 1000 + (draftId % 30) * 60 * 1000); // +~25–55 min
  let resolved = addMs(created, (1 + (draftId % 3)) * DAY_MS + (draftId % 6) * 3600 * 1000);
  if (resolved.getTime() > now.getTime()) resolved = addMs(now, -3600 * 1000);
  return { created, resolved };
}

// Deterministic approve/reject + override decisions (idempotent, id-seeded).
const isRejected = (id) => id % REJECT_EVERY === 0;
const isEdited = (id) => !isRejected(id) && id % OVERRIDE_EVERY === 0;
const rejectReason = (id) => REJECT_REASONS[id % REJECT_REASONS.length];

// Mirror createTask's per-company counter bump (see lib/db.js createTask). Returns
// { number, companyId }. MUST run inside the same tx as the task.create.
async function bumpCounter(tx, onboardingId) {
  const rows = await tx.$queryRaw`
    WITH ob AS (
      SELECT "companyId" FROM "Onboarding" WHERE id = ${onboardingId}
    ),
    mx AS (
      SELECT COALESCE(MAX(t."number"), 0) AS max_n
        FROM "Task" t
        JOIN "Onboarding" o ON o.id = t."onboardingId"
       WHERE o."companyId" = (SELECT "companyId" FROM ob)
    ),
    upd AS (
      UPDATE "Company"
         SET "taskCounter" = GREATEST("taskCounter", (SELECT max_n FROM mx)) + 1
       WHERE id = (SELECT "companyId" FROM ob)
       RETURNING "taskCounter", id
    )
    SELECT "taskCounter" AS "number", id AS "companyId" FROM upd;
  `;
  if (!rows || rows.length === 0) throw new Error(`Onboarding ${onboardingId} not found`);
  return { number: Number(rows[0].number), companyId: Number(rows[0].companyId) };
}

async function nextSortOrder(tx, phaseId) {
  const agg = await tx.task.aggregate({ where: { phaseId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
}

// Mirror the ActivityLog rows that emitActivity() would write when the approve
// route runs createTask / updateTask / createComment with { actor }, but write
// them directly so we can (a) backdate createdAt to the resolution date and
// (b) NOT fire deriveCustomerEmails / deriveNotifications — a historical seed
// must never send real customer emails, and vendor-authored events derive no
// notification rows anyway (see deriveNotifications in lib/db.js). resolvedBy is
// the acting VendorUser; if null we skip, matching emitActivity's vendor guard.
// NOTE: health_flipped is intentionally NOT reconstructed — it depends on the
// onboarding's whole task set at a historical point in time that we don't
// rebuild here. The demo feed's visible verbs (created / assigned /
// status_changed / completed / commented) are all mirrored.
async function emitBackdatedActivity(tx, { onboardingId, resolvedBy, verb, entityId, metadata, at, entityType = "task" }) {
  if (resolvedBy == null) return;
  await tx.activityLog.create({
    data: {
      onboardingId,
      actorType: "vendor",
      actorVendorId: resolvedBy,
      verb,
      entityType,
      entityId,
      metadata,
      createdAt: at,
    },
  });
}

// Compose a task's human-readable id (e.g. "AC-12") the way mapTask() does.
async function taskCode(tx, taskId) {
  const t = await tx.task.findUnique({
    where: { id: taskId },
    select: { number: true, onboarding: { select: { company: { select: { prefix: true } } } } },
  });
  const prefix = t?.onboarding?.company?.prefix ?? null;
  const number = t?.number ?? null;
  return prefix && number ? `${prefix}-${number}` : null;
}

async function main() {
  const now = new Date();
  console.log(
    `${WRITE ? "[WRITE] mutating the database" : "[DRY RUN] no writes — pass --write to apply"}\n`
  );

  // Vendor users for resolvedBy / owner fallback.
  const vendorUsers = await prisma.vendorUser.findMany();
  const activeVendor = vendorUsers.find((u) => u.role === "admin" || u.role === "member") ?? vendorUsers[0];

  // ── Step 1: backdate ExternalEvent receivedAt / processedAt ────────────────
  const events = await prisma.externalEvent.findMany({
    where: { source: "miniti" },
    orderBy: { occurredAt: "desc" },
    include: { onboarding: { select: { id: true, ownerId: true, companyId: true } } },
  });

  console.log(`ExternalEvents (miniti): ${events.length}`);
  let eventUpdates = 0;
  for (const ev of events) {
    // receivedAt ≈ occurredAt + a few seconds; processedAt ≈ + ~1 min, but only
    // when the event was actually processed (matched, non-ambiguous).
    const receivedAt = addMs(ev.occurredAt, 4000);
    const processedAt = ev.processedAt ? addMs(ev.occurredAt, 65000) : null;
    const changed =
      iso(ev.receivedAt) !== iso(receivedAt) ||
      iso(ev.processedAt) !== iso(processedAt);
    if (!changed) continue;
    eventUpdates++;
    console.log(
      `  event ${ev.id} (${iso(ev.occurredAt).slice(0, 10)}): receivedAt→${iso(receivedAt).slice(0, 19)}` +
        `  processedAt→${processedAt ? iso(processedAt).slice(0, 19) : "(null, unprocessed)"}`
    );
    if (WRITE) {
      await prisma.externalEvent.update({
        where: { id: ev.id },
        data: { receivedAt, ...(ev.processedAt ? { processedAt } : {}) },
      });
    }
  }
  console.log(`  → ${eventUpdates} event(s) ${WRITE ? "updated" : "would update"}\n`);

  // ── Step 2: resolve older drafts ───────────────────────────────────────────
  // Protect the newest N meetings regardless of age.
  const protectedEventIds = new Set(events.slice(0, NEWEST_PENDING).map((e) => e.id));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const drafts = await prisma.pendingAIChange.findMany({
    where: { source: "miniti", status: "pending" },
    orderBy: { id: "asc" },
  });

  const resolvable = drafts.filter((d) => {
    const ev = eventById.get(d.sourceEventId);
    if (!ev) return false;                          // no parent event → leave alone
    if (protectedEventIds.has(ev.id)) return false; // newest meetings stay pending
    return daysBetween(now, ev.occurredAt) > CUTOFF_DAYS;
  });

  console.log(
    `PendingAIChange (miniti, pending): ${drafts.length} total, ${resolvable.length} eligible to resolve ` +
      `(older than ${CUTOFF_DAYS}d, excluding newest ${NEWEST_PENDING} meetings)`
  );

  const stats = { approvedCreate: 0, approvedOther: 0, edited: 0, rejected: 0, skipped: 0, activityRows: 0 };

  for (const draft of resolvable) {
    const ev = eventById.get(draft.sourceEventId);
    const { created, resolved } = draftTimestamps(ev.occurredAt, draft.id, now);
    const resolvedBy =
      vendorUsers.find((u) => u.id === ev.onboarding?.ownerId)?.id ?? activeVendor?.id ?? null;
    const payload = draft.payload ?? {};

    // ---- Reject path (~20%) --------------------------------------------------
    if (isRejected(draft.id)) {
      const reason = rejectReason(draft.id);
      stats.rejected++;
      console.log(`  draft ${draft.id} [${draft.action}] REJECT — "${reason}"  (resolved ${iso(resolved).slice(0, 10)})`);
      if (WRITE) {
        await prisma.pendingAIChange.update({
          where: { id: draft.id },
          data: { status: "rejected", rejectedReason: reason, createdAt: created, resolvedAt: resolved, resolvedBy },
        });
      }
      continue;
    }

    // ---- Approve path (~80%) -------------------------------------------------
    const edited = isEdited(draft.id);
    const overrides = {};
    if (edited) {
      if (draft.action === "create_task") {
        if (payload.priority !== "high") overrides.priority = "high";
        else overrides.dueDate = iso(addMs(ev.occurredAt, 10 * DAY_MS)).slice(0, 10);
      }
    }
    const merged = { ...payload, ...overrides };

    try {
      if (draft.action === "create_task") {
        const onboardingId = draft.onboardingId;
        const phaseId = merged.phaseId;
        stats.approvedCreate++;
        if (edited) stats.edited++;
        console.log(
          `  draft ${draft.id} [create_task] APPROVE → new task "${merged.title}"` +
            `${edited ? `  (edited: ${JSON.stringify(overrides)})` : ""}  createdAt=${iso(resolved).slice(0, 10)}`
        );
        if (WRITE) {
          await prisma.$transaction(async (tx) => {
            const { number, companyId } = await bumpCounter(tx, onboardingId);
            const sortOrder = await nextSortOrder(tx, phaseId);
            const task = await tx.task.create({
              data: {
                onboardingId,
                phaseId,
                title: merged.title || "Untitled task",
                description: merged.description || "",
                status: "Not started",
                due: merged.dueDate || "",
                owner: "",
                ownerId: merged.ownerId ?? null,
                members: [],
                notes: merged.notes || "",
                sortOrder,
                priority: merged.priority ?? null,
                blockedByTaskId: merged.blockedByTaskId ?? null,
                assigneeContactId: merged.assigneeContactId ?? null,
                companyId,
                number,
                createdAt: resolved,
              },
              include: {
                assigneeContact: { select: { name: true } },
                onboarding: { select: { company: { select: { prefix: true } } } },
              },
            });
            await tx.pendingAIChange.update({
              where: { id: draft.id },
              data: { status: "applied", createdAt: created, resolvedAt: resolved, resolvedBy, appliedTaskId: task.id },
            });
            // Mirror createTask's emitActivity: a `created` row, plus `assigned`
            // when the new task was created with a contact assignee.
            const code =
              task.onboarding?.company?.prefix && task.number
                ? `${task.onboarding.company.prefix}-${task.number}`
                : null;
            await emitBackdatedActivity(tx, {
              onboardingId, resolvedBy, verb: "created", entityId: task.id, at: resolved,
              metadata: { title: task.title, taskId: code },
            });
            if (task.assigneeContactId) {
              await emitBackdatedActivity(tx, {
                onboardingId, resolvedBy, verb: "assigned", entityId: task.id, at: resolved,
                metadata: {
                  title: task.title,
                  taskId: code,
                  assigneeContactId: task.assigneeContactId,
                  assigneeName: task.assigneeContact?.name ?? null,
                },
              });
              stats.activityRows++;
            }
            stats.activityRows++;
          });
        }
        continue;
      }

      // match_existing / update_status / draft_followup → mirror approve's effect
      // on the referenced task. Verify the task still exists + belongs first.
      const targetId = payload.taskId;
      const target = targetId != null ? await prisma.task.findUnique({ where: { id: targetId } }) : null;
      if (!target || target.onboardingId !== draft.onboardingId) {
        const reason = "task no longer exists";
        stats.rejected++;
        console.log(`  draft ${draft.id} [${draft.action}] AUTO-REJECT — ${reason} (taskId=${targetId})`);
        if (WRITE) {
          await prisma.pendingAIChange.update({
            where: { id: draft.id },
            data: { status: "rejected", rejectedReason: reason, createdAt: created, resolvedAt: resolved, resolvedBy },
          });
        }
        continue;
      }

      stats.approvedOther++;
      let effect = "(no field change)";
      const taskPatch = {};
      const commentToAdd = [];

      if (draft.action === "update_status" && merged.newStatus) {
        taskPatch.status = merged.newStatus;
        effect = `status → ${merged.newStatus}`;
      } else if (draft.action === "match_existing") {
        if (merged.action === "reprioritise" && merged.newPriority) {
          taskPatch.priority = merged.newPriority;
          effect = `priority → ${merged.newPriority}`;
        } else if (merged.action === "update_due_date" && merged.newDueDate) {
          taskPatch.due = merged.newDueDate;
          effect = `due → ${merged.newDueDate}`;
        } else if (merged.action === "reassign") {
          if (merged.newOwnerId !== undefined) taskPatch.ownerId = merged.newOwnerId == null ? null : Number(merged.newOwnerId);
          if (merged.newAssigneeContactId !== undefined)
            taskPatch.assigneeContactId = merged.newAssigneeContactId == null ? null : Number(merged.newAssigneeContactId);
          commentToAdd.push({
            author: resolvedBy ? vendorUsers.find((u) => u.id === resolvedBy)?.name ?? "Vector" : "Vector",
            body: `Vector flagged a reassignment: ${merged.sourceQuote ?? "(no quote)"}`,
          });
          effect = `reassign ${JSON.stringify(taskPatch)} + audit comment`;
        }
      } else if (draft.action === "draft_followup") {
        const subject = (merged.subject ?? "").trim();
        const body = (merged.body ?? "").trim();
        const commentBody = [subject, body].filter(Boolean).join("\n\n");
        if (commentBody) {
          commentToAdd.push({ author: merged.fromName || (resolvedBy ? vendorUsers.find((u) => u.id === resolvedBy)?.name ?? "Vector" : "Vector"), body: commentBody });
          effect = "portal comment published";
        }
      }

      console.log(`  draft ${draft.id} [${draft.action}] APPROVE → ${effect}  (task ${targetId}, resolved ${iso(resolved).slice(0, 10)})`);
      if (WRITE) {
        await prisma.$transaction(async (tx) => {
          const code = await taskCode(tx, targetId);
          if (Object.keys(taskPatch).length > 0) {
            await tx.task.update({ where: { id: targetId }, data: taskPatch });
          }
          // Mirror updateTask's emitActivity: a status change emits
          // `completed` (→ Done) or `status_changed`; an assignee change to a
          // non-null contact emits `assigned`. Priority / due-only patches emit
          // nothing (they aren't activity-bearing on their own).
          if (taskPatch.status !== undefined && taskPatch.status !== target.status) {
            await emitBackdatedActivity(tx, {
              onboardingId: draft.onboardingId, resolvedBy,
              verb: taskPatch.status === "Done" ? "completed" : "status_changed",
              entityId: targetId, at: resolved,
              metadata: { from: target.status, to: taskPatch.status, title: target.title, taskId: code },
            });
            stats.activityRows++;
          }
          if (
            taskPatch.assigneeContactId !== undefined &&
            taskPatch.assigneeContactId != null &&
            taskPatch.assigneeContactId !== target.assigneeContactId
          ) {
            const contact = await tx.contact.findUnique({
              where: { id: taskPatch.assigneeContactId },
              select: { name: true },
            });
            await emitBackdatedActivity(tx, {
              onboardingId: draft.onboardingId, resolvedBy, verb: "assigned",
              entityId: targetId, at: resolved,
              metadata: {
                title: target.title,
                taskId: code,
                assigneeContactId: taskPatch.assigneeContactId,
                assigneeName: contact?.name ?? null,
                previousAssigneeContactId: target.assigneeContactId,
              },
            });
            stats.activityRows++;
          }
          for (const c of commentToAdd) {
            await tx.comment.create({ data: { taskId: targetId, author: c.author, body: c.body, createdAt: resolved } });
            await tx.task.update({ where: { id: targetId }, data: { commentCount: { increment: 1 } } });
            // Mirror createComment's emitActivity: a `commented` row.
            await emitBackdatedActivity(tx, {
              onboardingId: draft.onboardingId, resolvedBy, verb: "commented",
              entityId: targetId, at: resolved,
              metadata: { taskTitle: target.title, taskId: code, excerpt: c.body.slice(0, 120) },
            });
            stats.activityRows++;
          }
          await tx.pendingAIChange.update({
            where: { id: draft.id },
            data: { status: "applied", createdAt: created, resolvedAt: resolved, resolvedBy, appliedTaskId: targetId },
          });
        });
      }
    } catch (err) {
      stats.skipped++;
      console.error(`  draft ${draft.id} [${draft.action}] SKIPPED — ${err.message}`);
    }
  }

  // Backdate createdAt on the drafts we're leaving pending too, so the inbox
  // timestamps line up with their meetings (no status change).
  const stillPending = drafts.filter((d) => !resolvable.includes(d));
  let pendingBackdated = 0;
  for (const draft of stillPending) {
    const ev = eventById.get(draft.sourceEventId);
    if (!ev) continue;
    const { created } = draftTimestamps(ev.occurredAt, draft.id, now);
    if (iso(draft.createdAt) === iso(created)) continue;
    pendingBackdated++;
    if (WRITE) {
      await prisma.pendingAIChange.update({ where: { id: draft.id }, data: { createdAt: created } });
    }
  }

  console.log("\n──────────────────────────────────────────");
  console.log(`Approved create_task: ${stats.approvedCreate} (of which edited: ${stats.edited})`);
  console.log(`Approved other:       ${stats.approvedOther}`);
  console.log(`Rejected:             ${stats.rejected}`);
  console.log(`Skipped (errors):     ${stats.skipped}`);
  console.log(`ActivityLog rows:     ${stats.activityRows} ${WRITE ? "written" : "(only counted on --write)"}`);
  console.log(`Left pending:         ${stillPending.length} (${pendingBackdated} ${WRITE ? "backdated" : "would backdate"})`);
  console.log(`Events ${WRITE ? "updated" : "to update"}:      ${eventUpdates}`);
  if (!WRITE) console.log("\nDRY RUN — nothing was written. Re-run with --write to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
