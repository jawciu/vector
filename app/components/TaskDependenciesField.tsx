"use client";

/**
 * The task drawer's "Dependencies" field (GAPS-PLAN feature 2).
 *
 * A task can wait on several things: other tasks on the board, or anything
 * that is not a task ("platform team sign-off"), typed as free text. Each
 * dependency is listed under the field row:
 *   - a task blocker shows its id chip and title (it is resolved by finishing
 *     that task);
 *   - a text blocker has a tick box to mark it resolved (struck through and
 *     muted once ticked), so the record stays but stops counting;
 *   - both have a remove button.
 * The field row opens a popover with one text box: typing filters the board's
 * tasks and Enter adds what was typed as a text blocker. Every control is a
 * native button, checkbox or input, so it is all keyboard operable; Escape
 * closes the popover and returns focus to the field row.
 *
 * Writes go through /api/tasks/[id]/dependencies and return the task in the
 * board shape, handed to `onTaskUpdated` like the drawer's other edits.
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ClientTask } from "./types";
import FieldRow from "../ui/FieldRow";
import { MenuList, MenuOption } from "./Menu";
import TextField from "../ui/TextField";
import Checkbox from "../ui/Checkbox";
import IconButton from "../ui/IconButton";
import TaskIdChip from "../ui/TaskIdChip";
import { CloseIcon, DependenciesIcon } from "../ui/Icons";
import { cleanDependencyLabel } from "@/lib/task-dependencies";

type Props = {
  task: ClientTask;
  allTasks: ClientTask[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onTaskUpdated: (task: ClientTask) => void;
};

export default function TaskDependenciesField({ task, allTasks, open, onToggle, onClose, onTaskUpdated }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // After a removal, which row's controls should get focus once the list re-renders.
  const focusAfterRemove = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const deps = task.dependencies ?? [];
  const linked = new Set(deps.map((d) => d.blockedByTask?.id).filter((x): x is number => x != null));
  const q = query.trim().toLowerCase();
  const candidates = allTasks
    // A Done task no longer holds anything up, so it is not offered as a blocker.
    .filter((t) => t.id !== task.id && !linked.has(t.id) && t.status !== "Done")
    .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.taskId ?? "").toLowerCase().includes(q))
    .slice(0, 8);
  const typed = cleanDependencyLabel(query);
  const openCount = deps.filter((d) => (d.blockedByTask ? d.blockedByTask.status !== "Done" : !d.resolvedAt)).length;

  // The text box is not a ref-forwarding primitive, so reach it through the popover.
  const focusInput = () => popRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  useEffect(() => {
    if (open) focusInput();
    else setQuery("");
  }, [open]);

  // Escape inside the popover closes the popover only, not the drawer. The
  // drawer listens on `document`, which is also React's root in the App
  // Router, so a React stopPropagation cannot reach it: catch the key on
  // window in the capture phase, before either.
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape" || !popRef.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      onClose();
      rowRef.current?.querySelector<HTMLButtonElement>(".field-main")?.focus();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  async function send(url: string, method: string, body?: unknown) {
    // Controls stay enabled while saving (disabling a focused control drops
    // focus to the page), so a second action during a save is ignored here.
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save the dependency");
        return false;
      }
      onTaskUpdated(data as ClientTask);
      return true;
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/tasks/${task.id}/dependencies`;
  async function addTask(id: number) {
    if (await send(base, "POST", { blockedByTaskId: id })) { setQuery(""); focusInput(); }
  }
  async function addText() {
    // The box stays enabled while saving (disabling it would drop focus), so guard here.
    if (!typed || busy) return;
    if (await send(base, "POST", { text: typed })) { setQuery(""); focusInput(); }
  }

  async function remove(depId: number, index: number) {
    focusAfterRemove.current = index;
    if (!(await send(`${base}/${depId}`, "DELETE"))) focusAfterRemove.current = null;
  }

  // Hand focus on after a removal: the row that took the removed one's place,
  // else the one before it, else the field row itself.
  useEffect(() => {
    const i = focusAfterRemove.current;
    if (i == null) return;
    focusAfterRemove.current = null;
    const rows = listRef.current?.querySelectorAll("li") ?? [];
    const row = rows[Math.min(i, rows.length - 1)];
    const target = row?.querySelector<HTMLElement>("[role=checkbox], button")
      ?? rowRef.current?.querySelector<HTMLButtonElement>(".field-main");
    target?.focus();
  }, [deps.length]);

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addText();
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div ref={rowRef} className="relative">
        <FieldRow
          icon={<DependenciesIcon className="shrink-0" />}
          active={open}
          onClick={onToggle}
        >
          <span className="text-sm text-text-muted">Dependencies</span>
          {deps.length > 0 && (
            <span className="text-sm text-text">
              {openCount === 0 ? "All resolved" : `${openCount} open`}
            </span>
          )}
        </FieldRow>
        {open && (
          <div ref={popRef}>
          <MenuList
            role="group"
            aria-label="Add a dependency"
            style={{ width: "100%", maxWidth: 360 }}
          >
            <div className="p-1">
              <TextField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search tasks, or type a blocker"
                aria-label="Search tasks, or type a blocker that is not a task"
                aria-busy={busy || undefined}
                maxLength={200}
              />
            </div>
            <div role="listbox" aria-label="Blockers to add" className="max-h-40 overflow-y-auto flex flex-col gap-1">
              {typed && (
                <MenuOption onClick={addText}>
                  <span className="min-w-0 break-words">Add &ldquo;{typed}&rdquo; as a blocker</span>
                </MenuOption>
              )}
              {candidates.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-text-muted">{q ? "No matching tasks" : "No other tasks"}</div>
              ) : (
                candidates.map((t) => (
                  <MenuOption key={t.id} onClick={() => addTask(t.id)}>
                    <span className="min-w-0 break-words">
                      <TaskIdChip task={t} />
                      {t.title}
                    </span>
                  </MenuOption>
                ))
              )}
            </div>
          </MenuList>
          </div>
        )}
      </div>

      {deps.length > 0 && (
        <ul ref={listRef} className="flex w-full min-w-0 flex-col gap-1 pl-8" aria-label="Dependencies">
          {deps.map((d, index) => {
            const name = d.blockedByTask ? `${d.blockedByTask.taskId ?? ""} ${d.blockedByTask.title}`.trim() : d.label ?? "";
            const resolved = d.blockedByTask ? d.blockedByTask.status === "Done" : !!d.resolvedAt;
            return (
              <li key={d.id} className="group flex items-start gap-2 min-h-6 text-sm leading-6">
                {d.blockedByTask ? (
                  <DependenciesIcon className="shrink-0 mt-1 text-text-muted" />
                ) : (
                  <Checkbox
                    checked={resolved}
                    onChange={(checked) => send(`${base}/${d.id}`, "PATCH", { resolved: checked })}
                    aria-label={`${resolved ? "Reopen" : "Mark resolved"}: ${name}`}
                    className="mt-1 shrink-0"
                  />
                )}
                <span className={`flex-1 min-w-0 break-words ${resolved ? "line-through text-text-muted" : "text-text"}`}>
                  {d.blockedByTask ? (
                    <>
                      <TaskIdChip task={d.blockedByTask} />
                      {d.blockedByTask.title}
                    </>
                  ) : (
                    d.label
                  )}
                </span>
                <IconButton
                  aria-label={`Remove dependency: ${name}`}
                  onClick={() => remove(d.id, index)}
                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <CloseIcon />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="pl-8 text-sm text-danger">{error}</p>}
    </div>
  );
}
