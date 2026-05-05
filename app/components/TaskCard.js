"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TaskCardView from "./TaskCardView";

/**
 * Kanban task card. Wraps `TaskCardView` (the visual layer) with dnd-kit's
 * sortable wiring and the toggle-done API call. The visual layer is shared
 * with read-only surfaces (e.g. InsightsPanel Focus today).
 */
export default function TaskCard({ task, onTaskUpdated, onCardClick, isOverlay }) {
  const [completing, setCompleting] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: isOverlay });

  const wrapperProps = {
    ref: setNodeRef,
    ...attributes,
    ...listeners,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    },
  };

  async function handleToggleDone(e) {
    e.stopPropagation();
    if (completing) return;

    const goingToDone = task.status !== "Done";
    if (goingToDone) setCompleting(true);

    const patch = task.status === "Done"
      ? { status: task.previousStatus || "Not started", previousStatus: null }
      : { status: "Done", previousStatus: task.status };

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) throw new Error("Failed");

      const updatedTask = await response.json();

      if (goingToDone) {
        setTimeout(() => {
          if (onTaskUpdated) onTaskUpdated(updatedTask);
          setCompleting(false);
        }, 800);
      } else {
        if (onTaskUpdated) onTaskUpdated(updatedTask);
        setCompleting(false);
      }
    } catch {
      setCompleting(false);
    }
  }

  return (
    <TaskCardView
      task={task}
      isCompleting={completing}
      onCardClick={onCardClick}
      onToggleDone={handleToggleDone}
      wrapperProps={wrapperProps}
    />
  );
}
