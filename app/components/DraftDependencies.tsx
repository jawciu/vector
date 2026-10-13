/**
 * A draft's proposed dependencies in the AI inbox (GAPS-PLAN feature 2):
 * board tasks by id chip and title, things that are not tasks as a plain text
 * chip. With `onRemove`, each one has a remove button (the edit forms).
 * Long titles and labels wrap rather than truncate: readable over tidy.
 * After a removal, focus moves to the next remove button (or the previous
 * one); when the last one goes, `onEmptied` lets the form put focus somewhere
 * sensible instead of dropping it on the page.
 */
"use client";
import { useEffect, useRef } from "react";
import type { DependsOnItem } from "@/lib/task-dependencies";
import IconButton from "../ui/IconButton";
import TaskIdChip from "../ui/TaskIdChip";
import { CloseIcon } from "../ui/Icons";

type TaskLite = { id: number; title: string; taskId?: string | null };

export default function DraftDependencies({
  items,
  tasks,
  onRemove,
  onEmptied,
  disabled = false,
  align = "start",
}: {
  /** Called after the last item is removed, to move focus elsewhere. */
  onEmptied?: () => void;
  /** "end" right-aligns the chips (the compact card's right-hand column). */
  align?: "start" | "end";
  items: DependsOnItem[];
  tasks: TaskLite[];
  onRemove?: (index: number) => void;
  disabled?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // Index of the item just removed; acted on once the shorter list renders.
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    const i = focusIndex.current;
    if (i == null) return;
    focusIndex.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    if (buttons.length > 0) buttons[Math.min(i, buttons.length - 1)].focus();
    else onEmptied?.();
  }, [items.length, onEmptied]);

  if (items.length === 0) return null;
  return (
    <ul
      ref={listRef}
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
                ? "inline-flex max-w-full min-w-0 items-start gap-1"
                : "inline-flex max-w-full min-w-0 items-start gap-1 rounded-md border border-border px-1 text-xs leading-5"
            }
          >
            <span className="min-w-0 break-words">
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
              <IconButton aria-label={`Remove blocker: ${name}`} onClick={() => { focusIndex.current = i; onRemove(i); }} disabled={disabled} className="shrink-0">
                <CloseIcon />
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
