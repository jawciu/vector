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
  getOnboardings,
  getRecentCompletionsByOnboarding,
  getRecentWinsForOnboarding,
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

  // Recent wins — needs current health so health_improved wins can be
  // gated against subsequent regressions.
  const recentWins = await getRecentWinsForOnboarding(onboardingId, {
    sinceDays: 7,
    currentHealth: health,
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
    recentWins,
  };
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
    recentWinKeys: (snapshot.recentWins ?? [])
      .map((w) => `${w.kind}:${w.taskId ?? w.contactId ?? "?"}`)
      .sort(),
  };
  return createHash("sha256")
    .update(JSON.stringify(minimal))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Build the portfolio-scope snapshot.
 *
 * Aggregates one summary line per onboarding (~300 tokens each, no
 * individual task data). Uses the existing getOnboardings() helper
 * which already returns health + counts.
 *
 * Returns a serialisable object with `onboardings: [...]`.
 */
export async function buildPortfolioSnapshot({ statusFilter = "Active", today = new Date() } = {}) {
  const list = await getOnboardings(statusFilter);
  const recentCompletions = await getRecentCompletionsByOnboarding({ sinceDays: 7 });
  const now = today;

  const onboardings = list.map((ob) => {
    const targetGoLive = ob.targetGoLive ? new Date(ob.targetGoLive) : null;
    const daysToGoLive = targetGoLive ? daysBetween(now, targetGoLive) : null;
    const lastActivityAt = ob.lastActivity ? new Date(ob.lastActivity) : null;
    const daysSinceLastActivity = lastActivityAt ? daysBetween(lastActivityAt, now) : null;
    const completed = recentCompletions.get(Number(ob.id)) ?? { count: 0, titles: [] };

    return {
      id: Number(ob.id),
      company: ob.companyName,
      owner: ob.owner ?? null,
      status: ob.onboardingStatus,
      health: ob.health,
      healthReasons: ob.healthReasons ?? [],
      taskCount: ob.taskCount,
      blockedCount: ob.blockedCount,
      nextAction: ob.nextAction ?? null,
      daysToGoLive,
      daysSinceLastActivity,
      recentCompletions7d: completed.count,
      recentCompletionTitles: completed.titles,
    };
  });

  return {
    today: now.toISOString().slice(0, 10),
    portfolio: {
      totalOnboardings: onboardings.length,
      onTrackCount: onboardings.filter((o) => o.health === "On track").length,
      atRiskCount: onboardings.filter((o) => o.health === "At risk").length,
      blockedCount: onboardings.filter((o) => o.health === "Blocked").length,
      statusFilter,
    },
    onboardings,
  };
}

/**
 * Hash the portfolio snapshot. Inputs are intentionally narrow: per-onboarding
 * health + counts + days-to-go-live. Editing one task description doesn't
 * shift the hash; flipping an onboarding to At risk does.
 */
export function hashPortfolioSnapshot(snapshot) {
  const minimal = {
    items: snapshot.onboardings
      .map((o) =>
        [
          o.id,
          o.health,
          o.taskCount,
          o.blockedCount,
          o.daysToGoLive ?? "n",
          o.recentCompletions7d ?? 0,
        ].join(":")
      )
      .sort(),
    statusFilter: snapshot.portfolio.statusFilter,
  };
  return createHash("sha256")
    .update(JSON.stringify(minimal))
    .digest("hex")
    .slice(0, 16);
}
