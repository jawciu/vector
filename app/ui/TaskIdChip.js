/**
 * TaskIdChip — DS primitive
 *
 * Renders the human-readable task identifier (e.g. `AC-12`) as a small,
 * monospaced, muted inline prefix next to a task title. Source of truth
 * is `task.taskId` (composed server-side from `company.prefix` + `task.number`
 * in `lib/db.js#mapTask`).
 *
 * Renders nothing if the task has no `taskId` — defensive guard for the
 * rare case where Phase 4a/Phase 0 hasn't covered a particular surface
 * (or for stub objects in storybook-style tests).
 *
 * Visual: inline `<span>` with `.task-id` styling (mono font, muted text,
 * slightly smaller than body). No background, no border — consistent with
 * how other inline metadata reads in this app.
 *
 * Usage:
 *   <TaskIdChip task={task} />
 *   <span>{task.title}</span>
 */
export default function TaskIdChip({ task, className = "" }) {
  if (!task?.taskId) return null;
  return <span className={`task-id ${className}`.trim()}>{task.taskId}</span>;
}
