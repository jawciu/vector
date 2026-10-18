/**
 * A draft's proposed dependencies in the AI inbox (GAPS-PLAN feature 2):
 * All entries use plain 14px names without a border, whether they refer to a
 * board task, typed dependency or another draft. Board tasks retain their id
 * prefix. The parent provides the Dependencies icon/field label once; omit
 * workflow explanations and link-state text from the entries themselves.
 * With `onRemove`, each entry has a remove button. `presentation="tags"`
 * adds a quiet tag fill for entries held inside DraftDependenciesField.
 * Long titles and labels wrap rather than truncate: readable over tidy.
 * After a removal, focus moves to the next remove button (or the previous
 * one); when the last one goes, `onEmptied` lets the form put focus somewhere
 * sensible instead of dropping it on the page.
 */
"use client";
import { useEffect, useRef } from "react";
import { isDraftLink, type DraftDependsOnItem, type DraftLinkItem } from "@/lib/task-dependencies";
import IconButton from "../ui/IconButton";
import TaskIdChip from "../ui/TaskIdChip";
import { CloseIcon } from "../ui/Icons";

type TaskLite = { id: number; title: string; taskId?: string | null };

/** How a sibling-draft link reads on the card (lib/draft-links.ts draftLinkStatus). */
export type DraftLinkDescription = { title: string; label: string; tone: "pending" | "ok" | "warn" | "muted" };

export default function DraftDependencies({
  items,
  tasks,
  onRemove,
  onEmptied,
  disabled = false,
  align = "start",
  presentation = "plain",
  describeLink,
}: {
  /** Supplies the current task name. Link-state metadata is not displayed. */
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  /** Called after the last item is removed, to move focus elsewhere. */
  onEmptied?: () => void;
  /** "end" right-aligns entries (the compact card's right-hand column). */
  align?: "start" | "end";
  presentation?: "plain" | "tags";
  items: DraftDependsOnItem[];
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
  const itemClass = `inline-flex max-w-full min-w-0 items-center gap-1 text-sm leading-6${presentation === "tags" ? " rounded-md bg-surface-hover px-2 py-0.5" : ""}`;
  return (
    <ul
      ref={listRef}
      aria-label="Blocked by"
      className={`flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-secondary${align === "end" ? " justify-end" : presentation === "plain" ? " flex-1" : ""}`}
    >
      {items.map((d, i) => {
        if (isDraftLink(d)) {
          const info = describeLink?.(d) ?? { title: d.title ?? "Another task from this meeting", label: "", tone: "pending" as const };
          return (
            <li
              key={`d${d.draftId ?? d.draftRef}`}
              className={itemClass}
            >
              <span className="min-w-0 break-words">
                {info.title}
              </span>
              {onRemove && (
                <IconButton aria-label={`Remove blocker: ${info.title}`} onClick={() => { focusIndex.current = i; onRemove(i); }} disabled={disabled} className="shrink-0">
                  <CloseIcon />
                </IconButton>
              )}
            </li>
          );
        }
        const task = "taskId" in d ? tasks.find((t) => t.id === d.taskId) : null;
        const name = "taskId" in d ? `${task?.taskId ?? ""} ${task?.title ?? "A task no longer open"}`.trim() : d.text;
        return (
          <li
            key={"taskId" in d ? `t${d.taskId}` : `x${d.text}`}
            className={itemClass}
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
