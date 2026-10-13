/**
 * A draft's proposed dependencies in the AI inbox (GAPS-PLAN feature 2):
 * board tasks by id chip and title, things that are not tasks as a plain text
 * chip. With `onRemove`, each one has a remove button (the edit forms).
 */
import type { DependsOnItem } from "@/lib/task-dependencies";
import IconButton from "../ui/IconButton";
import TaskIdChip from "../ui/TaskIdChip";
import { CloseIcon } from "../ui/Icons";

type TaskLite = { id: number; title: string; taskId?: string | null };

export default function DraftDependencies({
  items,
  tasks,
  onRemove,
  disabled = false,
  align = "start",
}: {
  /** "end" right-aligns the chips (the compact card's right-hand column). */
  align?: "start" | "end";
  items: DependsOnItem[];
  tasks: TaskLite[];
  onRemove?: (index: number) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Blocked by"
      className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-text-secondary${align === "end" ? " justify-end" : ""}`}
    >
      {items.map((d, i) => {
        const task = "taskId" in d ? tasks.find((t) => t.id === d.taskId) : null;
        const name = "taskId" in d ? `${task?.taskId ?? ""} ${task?.title ?? "A task no longer open"}`.trim() : d.text;
        return (
          <li
            key={"taskId" in d ? `t${d.taskId}` : `x${d.text}`}
            className={
              "taskId" in d
                ? "inline-flex max-w-full items-center gap-1 min-w-0"
                : "inline-flex max-w-full items-center gap-1 min-w-0 rounded-md border border-border px-1 text-xs leading-5"
            }
          >
            <span className="truncate" title={name}>
              {"taskId" in d ? (
                <>
                  <TaskIdChip task={task} />
                  {task?.title ?? "A task no longer open"}
                </>
              ) : (
                d.text
              )}
            </span>
            {onRemove && (
              <IconButton aria-label={`Remove blocker: ${name}`} onClick={() => onRemove(i)} disabled={disabled} className="shrink-0">
                <CloseIcon />
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
