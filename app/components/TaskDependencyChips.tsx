/**
 * What a task waits on, as the board card shows it (GAPS-PLAN feature 2):
 * board tasks as their id chip (with the title when it is the only blocker)
 * and text blockers as a plain label chip, task blockers first. Resolved text blockers are left
 * off the card; they no longer hold anything up. Long labels wrap rather
 * than truncate (readable over tidy).
 *
 * Falls back to the legacy single `blockedByTask` when a task arrives
 * without `dependencies` (an older API shape).
 */
import type { ClientTask } from "./types";
import type { TaskDependencyView } from "@/lib/task-dependencies";
import { DependenciesIcon } from "../ui/Icons";
import TaskIdChip from "../ui/TaskIdChip";

export function cardDependencies(task: Pick<ClientTask, "dependencies" | "blockedByTask">): TaskDependencyView[] {
  if (Array.isArray(task.dependencies)) {
    // Task blockers first (a row of id chips), then text blockers.
    const open = task.dependencies.filter((d) => d.blockedByTask || (d.label && !d.resolvedAt));
    return [...open.filter((d) => d.blockedByTask), ...open.filter((d) => !d.blockedByTask)];
  }
  return task.blockedByTask
    ? [{ id: -1, blockedByTask: { ...task.blockedByTask, taskId: task.blockedByTask.taskId ?? null } }]
    : [];
}

export default function TaskDependencyChips({ task }: { task: Pick<ClientTask, "dependencies" | "blockedByTask"> }) {
  const deps = cardDependencies(task);
  if (deps.length === 0) return null;
  const single = deps.length === 1;
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <DependenciesIcon className="shrink-0 mt-1" />
      <span className="sr-only">Blocked by</span>
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-sm text-text-secondary">
        {deps.map((d) =>
          d.blockedByTask ? (
            <li key={d.id} className={single ? "min-w-0 break-words" : undefined} title={d.blockedByTask.title}>
              <TaskIdChip task={d.blockedByTask} />
              {(single || !d.blockedByTask.taskId) && d.blockedByTask.title}
            </li>
          ) : (
            <li
              key={d.id}
              className="max-w-full min-w-0 break-words rounded-md border border-border px-1 text-xs leading-5 text-text-secondary"
            >
              {d.label}
            </li>
          )
        )}
      </ul>
    </div>
  );
}
