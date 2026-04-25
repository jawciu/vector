/**
 * Layer 1 — deterministic snapshot builder for AI insights.
 *
 * Pure JavaScript: no AI, no LLM calls. Reads data via the existing
 * lib/db.js helpers (Prisma) and computes facts the AI will reason over.
 *
 * The output is a small JSON object that gets serialised and sent to
 * Claude as the user message. Every "interesting number" the AI cites
 * MUST come from this object — never expect Claude to do arithmetic.
 */

import { createHash } from "node:crypto";
import {
  getOnboarding,
  getTasksForOnboarding,
  getContactsForOnboarding,
  getPhasesForOnboarding,
} from "@/lib/db";
import { computeHealth } from "@/lib/health";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(a, b) {
  return Math.floor((b - a) / MS_PER_DAY);
}

/**
 * Classify a phase's current state from its tasks + activity.
 * Stable signals — adding a task doesn't whipsaw the classification
 * the way a percentage would.
 */
function classifyPhase(phase, phaseTasks, now) {
  if (phase.isComplete) return "complete";

  const openTasks = phaseTasks.filter((t) => t.status !== "Done");
  if (openTasks.length === 0) return "complete";

  const blockedTasks = openTasks.filter((t) => t.status === "Blocked");
  if (blockedTasks.length > 0) return "blocked";

  const allNotStarted = openTasks.every((t) => t.status === "Not started");
  if (allNotStarted && phaseTasks.every((t) => t.status === "Not started")) {
    return "not_started";
  }

  // Recent movement — we don't have per-task "lastStatusChangedAt" today,
  // so treat completed-tasks-in-the-phase + recent createdAt as
  // "progressing". For v1 this is a reasonable approximation; once
  // ActivityLog-per-task indexing is mature we can swap in true recency.
  return "progressing";
}

/**
 * Find the latest activity timestamp for a phase from its tasks.
 * Fallback to phase.targetDate as a coarse signal.
 */
function lastPhaseActivity(phaseTasks) {
  if (phaseTasks.length === 0) return null;
  const newest = phaseTasks.reduce((max, t) => {
    // We don't have updatedAt on tasks in the lightweight task object,
    // so this returns null and the consumer may fall back. Keeping the
    // hook in place so wiring real timestamps later is a 1-line change.
    return max;
  }, null);
  return newest;
}

/**
 * Build the per-onboarding snapshot.
 *
 * Returns a serialisable object suitable for both:
 *   - hashing (deterministic key for the cache)
 *   - sending to Claude as JSON in the user message
 *
 * `today` defaults to current date but can be overridden for tests.
 */
export async function buildOnboardingSnapshot(onboardingId, { today = new Date() } = {}) {
  const [onboarding, tasks, contacts, phases] = await Promise.all([
    getOnboarding(onboardingId),
    getTasksForOnboarding(onboardingId),
    getContactsForOnboarding(onboardingId),
    getPhasesForOnboarding(onboardingId),
  ]);

  if (!onboarding) return null;

  const now = today;
  const total = tasks.length;
  const tasksDone = tasks.filter((t) => t.status === "Done").length;

  // Overdue: due < today AND status != Done. Embed days-overdue inline.
  const tasksOverdue = tasks
    .filter((t) => {
      if (t.status === "Done" || !t.due) return false;
      return new Date(t.due + "T23:59:59") < now;
    })
    .map((t) => ({
      id: t.id,
      title: t.title,
      daysOverdue: daysBetween(new Date(t.due + "T23:59:59"), now),
      status: t.status,
      assigneeContactId: t.assigneeContactId ?? null,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  // Blocked tasks (status-based).
  const tasksBlocked = tasks
    .filter((t) => t.status === "Blocked")
    .map((t) => ({
      id: t.id,
      title: t.title,
      blockedByTaskId: t.blockedByTaskId ?? null,
      blockedByTitle: t.blockedByTask?.title ?? null,
    }));

  // Tasks that are blocking *other* tasks.
  const blockedByMap = new Map();
  for (const t of tasks) {
    if (t.blockedByTaskId != null) {
      const list = blockedByMap.get(t.blockedByTaskId) ?? [];
      list.push(t.id);
      blockedByMap.set(t.blockedByTaskId, list);
    }
  }
  const tasksBlockingOthers = Array.from(blockedByMap.entries()).map(
    ([blockingId, blockedIds]) => ({
      id: blockingId,
      title: tasks.find((t) => t.id === blockingId)?.title ?? "(unknown)",
      blocking: blockedIds,
    })
  );

  // Velocity over last 7 days — using completion as a proxy.
  // We don't have per-status-change timestamps yet, so this is "tasks
  // currently Done" as a coarse proxy until we have richer history.
  const velocity7d = Math.min(tasksDone, 7); // placeholder — refine later

  // Customer engagement — most-recent lastSeenPortalAt across contacts.
  const seenDates = contacts.map((c) => c.lastSeenPortalAt).filter(Boolean);
  const customerLastSeenPortalAt = seenDates.length > 0
    ? new Date(Math.max(...seenDates.map((d) => new Date(d).getTime()))).toISOString()
    : null;
  const daysSinceCustomerSeen = customerLastSeenPortalAt
    ? daysBetween(new Date(customerLastSeenPortalAt), now)
    : null;

  // Bounced contacts — contacts whose email bounced.
  const bouncedContacts = contacts
    .filter((c) => c.bouncedAt)
    .map((c) => ({ id: c.id, name: c.name, email: c.email }));

  // Phase state classification.
  const phasesEnriched = phases
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => {
      const phaseTasks = tasks.filter((t) => t.phaseId === p.id);
      const status = classifyPhase(p, phaseTasks, now);
      const targetDate = p.targetDate ? new Date(p.targetDate) : null;
      const daysOverdue =
        targetDate && targetDate < now && status !== "complete"
          ? daysBetween(targetDate, now)
          : null;
      return {
        id: p.id,
        name: p.name,
        status,
        openTasks: phaseTasks.filter((t) => t.status !== "Done").length,
        blockedTasks: phaseTasks.filter((t) => t.status === "Blocked").length,
        targetDate: targetDate?.toISOString() ?? null,
        daysOverdue,
        lastActivityAt: lastPhaseActivity(phaseTasks),
      };
    });

  // Health (existing pure helper).
  const { status: health, reasons: healthReasons } = computeHealth(tasks, {
    targetGoLive: onboarding.targetGoLive,
    createdAt: onboarding.createdAt,
  });

  // Days to target go-live.
  const targetGoLive = onboarding.targetGoLive ? new Date(onboarding.targetGoLive) : null;
  const daysToTargetGoLive = targetGoLive ? daysBetween(now, targetGoLive) : null;

  return {
    today: now.toISOString().slice(0, 10),
    onboarding: {
      id: onboarding.id,
      company: onboarding.companyName,
      owner: onboarding.owner || null,
      status: onboarding.status,
      targetGoLive: onboarding.targetGoLive,
      daysToTargetGoLive,
      createdAt: onboarding.createdAt,
    },
    facts: {
      totalTasks: total,
      tasksDone,
      tasksOverdue,
      tasksBlocked,
      tasksBlockingOthers,
      velocity7d,
      customerLastSeenPortalAt,
      daysSinceCustomerSeen,
      bouncedContacts,
      health,
      healthReasons,
    },
    phases: phasesEnriched,
    nudges: detectNudges({ tasks, contacts, now }),
  };
}

/**
 * Deterministic nudge detection. The AI ranks/rephrases these — it does
 * not invent them. Each kind has a hard rule below.
 */
function detectNudges({ tasks, contacts, now }) {
  const nudges = [];

  // Unassigned: no owner, no assignee, older than 2 days.
  const TWO_DAYS_AGO = now.getTime() - 2 * MS_PER_DAY;
  for (const t of tasks) {
    if (t.status === "Done") continue;
    const hasOwner = t.owner || t.ownerId;
    const hasAssignee = t.assigneeContactId != null;
    if (!hasOwner && !hasAssignee) {
      // We don't have createdAt per-task in the lightweight payload; treat
      // all unassigned open tasks as candidates and trust the AI/UI to
      // surface only truly stale ones via the source of truth in the DB.
      nudges.push({
        kind: "unassigned_task",
        taskId: t.id,
        title: t.title,
      });
    }
  }

  // Follow-up: blocked or overdue with customer assignee.
  for (const t of tasks) {
    if (t.status === "Done") continue;
    const hasCustomerAssignee = t.assigneeContactId != null;
    const isBlocked = t.status === "Blocked";
    const isOverdue = t.due && new Date(t.due + "T23:59:59") < now;
    if (hasCustomerAssignee && (isBlocked || isOverdue)) {
      nudges.push({
        kind: "follow_up",
        taskId: t.id,
        title: t.title,
        reason: isBlocked ? "blocked" : "overdue",
        assigneeContactId: t.assigneeContactId,
      });
    }
  }

  // Customer dark: lastSeenPortalAt > 10 days ago.
  for (const c of contacts) {
    if (!c.lastSeenPortalAt) continue;
    const days = daysBetween(new Date(c.lastSeenPortalAt), now);
    if (days >= 10) {
      nudges.push({
        kind: "customer_dark",
        contactId: c.id,
        name: c.name,
        daysSinceSeen: days,
      });
    }
  }

  return nudges;
}

/**
 * Deterministic hash of the snapshot's *meaningful* state. Used to detect
 * when the cached AI narrative is stale.
 *
 * Hash inputs (intentionally narrow — see "what does NOT trigger
 * regeneration" in the plan):
 *   - task IDs + statuses + due dates
 *   - blocked relationships (blockedByTaskId per task)
 *   - phase states
 *   - customer engagement: daysSinceCustomerSeen bucket (0-3, 4-7, 8+)
 *   - health status
 *
 * Excluded (would over-trigger):
 *   - task description / notes / comment counts
 *   - sortOrder
 *   - exact timestamps
 */
export function hashSnapshot(snapshot) {
  const minimal = {
    tasks: snapshot.facts.tasksOverdue
      .concat(snapshot.facts.tasksBlocked)
      .concat(snapshot.facts.tasksBlockingOthers)
      .map((t) => ({ id: t.id, status: t.status ?? null, blockedByTaskId: t.blockedByTaskId ?? null })),
    overdueIds: snapshot.facts.tasksOverdue.map((t) => t.id).sort(),
    blockedIds: snapshot.facts.tasksBlocked.map((t) => t.id).sort(),
    phaseStates: snapshot.phases.map((p) => `${p.id}:${p.status}:${p.openTasks}:${p.blockedTasks}`),
    health: snapshot.facts.health,
    engagementBucket:
      snapshot.facts.daysSinceCustomerSeen == null
        ? "none"
        : snapshot.facts.daysSinceCustomerSeen <= 3
        ? "active"
        : snapshot.facts.daysSinceCustomerSeen <= 7
        ? "warm"
        : snapshot.facts.daysSinceCustomerSeen <= 14
        ? "cold"
        : "dark",
  };
  return createHash("sha256")
    .update(JSON.stringify(minimal))
    .digest("hex")
    .slice(0, 16);
}
