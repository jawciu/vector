"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DraftDependsOnItem, DraftLinkItem } from "@/lib/task-dependencies";
import Button from "@/app/ui/Button";
import FieldPill from "@/app/ui/FieldPill";
import { DependenciesIcon, PlusIcon } from "@/app/ui/Icons";
import TaskIdChip from "@/app/ui/TaskIdChip";
import { MenuList, MenuOption } from "./Menu";
import DraftDependencies, { type DraftLinkDescription } from "./DraftDependencies";

/** Draft editor's dependency field: removable 14px tags live inside one
 *  field, alongside an Add control. Controls are siblings, never nested
 *  buttons. Multiple tags wrap; empty/remove/add transitions retain focus. */
export default function DraftDependenciesField({
  items,
  tasks,
  onChange,
  disabled = false,
  describeLink,
}: {
  items: DraftDependsOnItem[];
  tasks: { id: number; title: string; taskId?: string | null }[];
  onChange: (items: DraftDependsOnItem[]) => void;
  disabled?: boolean;
  describeLink?: (link: DraftLinkItem) => DraftLinkDescription;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const linked = new Set(items.flatMap((d) => "taskId" in d ? [d.taskId] : []));
  const candidates = tasks.filter((t) => !linked.has(t.id));
  const focusAdd = () => rootRef.current?.querySelector<HTMLButtonElement>("[data-add-dependency]")?.focus();

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="draft-dependencies-field relative min-w-0"
      role="group"
      aria-label="Dependencies"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          focusAdd();
        }
      }}
    >
      <FieldPill icon={<DependenciesIcon className="mt-2 shrink-0 self-start" />} active={open}>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <DraftDependencies
            items={items}
            tasks={tasks}
            presentation="tags"
            describeLink={describeLink}
            disabled={disabled}
            onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
            onEmptied={focusAdd}
          />
          <Button
            variant="tertiary"
            aria-label="Add dependency"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            data-add-dependency
            disabled={disabled}
            onClick={() => setOpen((value) => !value)}
            className={items.length > 0 ? "min-w-8 flex-1 self-start justify-end" : "flex-1 justify-start"}
          >
            {items.length > 0 ? <PlusIcon /> : "Dependencies"}
          </Button>
        </div>
      </FieldPill>
      {open && !disabled && (
        <MenuList id={menuId} aria-label="Add dependency" style={{ width: "100%", maxHeight: 240, overflowY: "auto" }}>
          {candidates.length === 0 ? (
            <p className="px-2 py-1 text-xs text-text-muted">No other tasks</p>
          ) : candidates.map((task) => (
            <MenuOption
              key={task.id}
              onClick={() => {
                onChange([...items, { taskId: task.id }]);
                setOpen(false);
                focusAdd();
              }}
            >
              <TaskIdChip task={task} />
              {task.title}
            </MenuOption>
          ))}
        </MenuList>
      )}
    </div>
  );
}
