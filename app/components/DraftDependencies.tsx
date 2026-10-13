/**
 * A draft's proposed dependencies in the AI inbox (GAPS-PLAN feature 2):
 * board tasks by id chip and title, things that are not tasks as a plain text
 * chip, and (GAPS-PLAN feature 3) another new task proposed from the same
 * meeting as "Depends on: <title> (also in this meeting)" with what approval
 * will do or did with it (`describeLink`). With `onRemove`, each one has a
 * remove button (the edit forms).
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

const TONE_CLASS: Record<DraftLinkDescription["tone"], string> = {
  pending: "text-text-muted",
  ok: "text-success",
  warn: "text-alert",
  muted: "text-text-muted",
};

export default function DraftDependencies({
  items,
  tasks,
  onRemove,
  onEmptied,
  disabled = false,
  align = "start",
  describeLink,
}: {
  /** Names a sibling-draft link and its state; without it, the snapshot title is shown. */
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
  /** Called after the last item is removed, to move focus elsewhere. */
  onEmptied?: () => void;
  /** "end" right-aligns the chips (the compact card's right-hand column). */
  align?: "start" | "end";
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
  return (
    <ul
      ref={listRef}
      aria-label="Blocked by"
      className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-text-secondary${align === "end" ? " justify-end" : ""}`}
    >
      {items.map((d, i) => {
        if (isDraftLink(d)) {
          const info = describeLink?.(d) ?? { title: d.title ?? "Another task from this meeting", label: "", tone: "pending" as const };
          return (
            <li
              key={`d${d.draftId ?? d.draftRef}`}
              className="inline-flex max-w-full min-w-0 items-start gap-1 rounded-md border border-border px-1 text-xs leading-5"
            >
              <span className="min-w-0 break-words">
                <span className="text-text-muted">Depends on: </span>
                {info.title}
                <span className="text-text-muted"> (also in this meeting)</span>
                {info.label && <span className={TONE_CLASS[info.tone]}>{` · ${info.label}`}</span>}
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
