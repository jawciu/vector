/**
 * Compute onboarding health from tasks + project dates.
 *
 * Returns { status: "Blocked" | "At risk" | "On track", reasons: string[] }.
 *
 * Signals:
 *   Blocked  — 30 %+ of tasks have status "Blocked"
 *   At risk  — any blocked tasks (< 30 %), overdue tasks, or behind pace
 *   On track — none of the above
 *
 * Velocity is only evaluated when a targetGoLive date exists.
 *
 * Text blockers (TaskDependency rows with a label, GAPS-PLAN feature 2) do NOT
 * affect health. Caroline confirmed on 2026-10-18 that a dependency such as
 * waiting on platform sign-off is not itself a Blocked task.
 */

import type { HealthResult, HealthStatus } from "./types";

/**
 * Product decision, 2026-10-18: keep false. Text dependencies do not change
 * onboarding health. Explicitly Blocked tasks still use the existing rule.
 */
export const TEXT_BLOCKERS_COUNT_AS_BLOCKED = false;

const BLOCKED_THRESHOLD = 0.3;
const OVERDUE_SINGLE_DAYS = 7;
const OVERDUE_MULTI_COUNT = 3;
const MIN_ELAPSED_DAYS_FOR_VELOCITY = 7;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** The task fields computeHealth reads. Accepts full Prisma rows or plain snapshots. */
export interface HealthTask {
  status: string;
  due?: string | null;
  /** The task's dependencies (board shape or DB rows). Only read when TEXT_BLOCKERS_COUNT_AS_BLOCKED. */
  dependencies?: { label?: string | null; resolvedAt?: unknown }[] | null;
}

function openTextBlockers(t: HealthTask): number {
  return (t.dependencies ?? []).filter((d) => d.label && !d.resolvedAt).length;
}

/** Whether a task counts as blocked for health. `textBlockersCount` exists for tests. */
export function countsAsBlocked(t: HealthTask, textBlockersCount = TEXT_BLOCKERS_COUNT_AS_BLOCKED): boolean {
  if (t.status === "Blocked") return true;
  return textBlockersCount && t.status !== "Done" && openTextBlockers(t) > 0;
}

export interface HealthDates {
  targetGoLive?: Date | string | number | null;
  createdAt?: Date | string | number | null;
}

export function computeHealth(
  tasks: HealthTask[],
  { targetGoLive = null, createdAt = null }: HealthDates = {},
  textBlockersCount: boolean = TEXT_BLOCKERS_COUNT_AS_BLOCKED
): HealthResult {
  const total = tasks.length;
  if (total === 0) return { status: "On track", reasons: [] };

  const now = new Date();
  const reasons: string[] = [];
  let status: HealthStatus = "On track";

  const blockedCount = tasks.filter((t) => countsAsBlocked(t, textBlockersCount)).length;
  const doneCount = tasks.filter((t) => t.status === "Done").length;

  // --- Blocked check ---
  if (blockedCount > 0) {
    const blockedPct = blockedCount / total;
    if (blockedPct >= BLOCKED_THRESHOLD) {
      status = "Blocked";
      reasons.push(`${blockedCount} of ${total} tasks blocked`);
    } else {
      status = "At risk";
      reasons.push(`${blockedCount} task${blockedCount > 1 ? "s" : ""} blocked`);
    }
  }

  // --- Overdue check ---
  const overdueTasks = tasks.filter((t) => {
    if (t.status === "Done" || !t.due) return false;
    const dueDate = new Date(t.due + "T23:59:59");
    return dueDate < now;
  });

  if (overdueTasks.length > 0) {
    const maxOverdueDays = Math.max(
      ...overdueTasks.map((t) => daysBetween(new Date(t.due + "T23:59:59"), now))
    );

    const shouldFlag =
      maxOverdueDays >= OVERDUE_SINGLE_DAYS ||
      overdueTasks.length >= OVERDUE_MULTI_COUNT;

    if (shouldFlag && status !== "Blocked") {
      status = "At risk";
    }

    if (shouldFlag) {
      if (overdueTasks.length === 1) {
        reasons.push(`1 task overdue by ${maxOverdueDays}d`);
      } else {
        reasons.push(`${overdueTasks.length} tasks overdue`);
      }
    }
  }

  // --- Velocity check (only with a go-live date) ---
  if (targetGoLive && createdAt) {
    const goLive = new Date(targetGoLive);
    const start = new Date(createdAt);
    const elapsedDays = daysBetween(start, now);
    const daysUntilGoLive = daysBetween(now, goLive);

    if (daysUntilGoLive > 0 && elapsedDays >= MIN_ELAPSED_DAYS_FOR_VELOCITY) {
      const remaining = total - doneCount;

      if (remaining > 0) {
        const completionRate = doneCount / elapsedDays;

        if (completionRate <= 0) {
          if (status !== "Blocked") status = "At risk";
          reasons.push(`No tasks completed in ${elapsedDays}d`);
        } else {
          const daysNeeded = remaining / completionRate;
          if (daysNeeded > daysUntilGoLive) {
            if (status !== "Blocked") status = "At risk";
            reasons.push(
              `Behind pace \u2014 ${remaining} tasks left, ${daysUntilGoLive}d to go-live`
            );
          }
        }
      }
    } else if (daysUntilGoLive <= 0 && total - doneCount > 0) {
      if (status !== "Blocked") status = "At risk";
      reasons.push("Past go-live date with open tasks");
    }
  }

  return { status, reasons };
}
