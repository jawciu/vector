import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Badge — DS primitive, the only status pill.
 *
 * Variants:
 *   outlined (default) — transparent, 0.5px border + text in the colour.
 *     md (default) 14px, the kanban card chip. sm 12px, the task drawer
 *     status picker.
 *   filled — the colour fills the pill, text goes textDark. One size,
 *     matching the board header blocked pill and the AI trend pill.
 *
 * Colour comes from ONE of:
 *   color  — a closed union of status tokens.
 *   status — a task status; Badge owns the status → colour mapping, so no
 *     call site re-derives it.
 *   health — a computeHealth state; same idea, and health is always outlined
 *     (the filled pill of those colours is the AI trend pill).
 * The props union makes two of them together, or size on filled, a type error.
 *
 * Phase 7 retrofit targets (all hand-rolled today): the task status chips in
 * TaskCardView, TaskDrawer, PortalTaskCard, AIDraftInbox, CreateTaskModal;
 * InsightStatusPill; the board header blocked pill and the list's health pill.
 */

export type BadgeColor =
  | "success"
  | "danger"
  | "alert"
  | "action"
  | "muted"
  | "mint"
  | "sky"
  | "candy";

/** Mirrors the states computeHealth returns (lib/health.js, pinned by Badge.test.js). */
export type HealthStatus = "On track" | "At risk" | "Blocked";

/**
 * Health is ALWAYS outlined. The AI insight trend pill is filled and uses
 * these same three colours, so the fill is what tells the two apart at a
 * glance: computed health outlined, model-judged trend filled with an arrow.
 */
export const HEALTH_COLOR: Record<HealthStatus, BadgeColor> = {
  "On track": "success",
  "At risk": "alert",
  Blocked: "danger",
};

/** Mirrors TASK_STATUSES in lib/constants.js (pinned by Badge.test.js). */
export type BadgeStatus =
  | "Not started"
  | "In progress"
  | "Under investigation"
  | "On hold"
  | "Blocked"
  | "Done";

export const STATUS_COLOR: Record<BadgeStatus, BadgeColor> = {
  "Not started": "muted",
  "In progress": "mint",
  "Under investigation": "sky",
  "On hold": "candy",
  Blocked: "danger",
  Done: "success",
};

// Token utilities, not inline var()s, so every badge stays on the palette.
const OUTLINED_CLASSES: Record<BadgeColor, string> = {
  success: "text-success",
  danger: "text-danger",
  alert: "text-alert",
  action: "text-action",
  muted: "text-text-muted",
  mint: "text-mint",
  sky: "text-sky",
  candy: "text-candy",
};

const FILLED_CLASSES: Record<BadgeColor, string> = {
  success: "bg-success",
  danger: "bg-danger",
  alert: "bg-alert",
  action: "bg-action",
  muted: "bg-text-muted",
  mint: "bg-mint",
  sky: "bg-sky",
  candy: "bg-candy",
};

export type BadgeSize = "sm" | "md";

type ColourProps =
  | { color?: BadgeColor; status?: never; health?: never }
  | { status: BadgeStatus; color?: never; health?: never }
  | { health: HealthStatus; color?: never; status?: never };

type VariantProps =
  | { variant?: "outlined"; size?: BadgeSize }
  | { variant: "filled"; size?: never };

export type BadgeProps = { children: ReactNode } & ColourProps & VariantProps;

export default function Badge(props: BadgeProps) {
  const { children, variant = "outlined" } = props;
  const color = props.status
    ? (STATUS_COLOR[props.status] ?? "muted")
    : props.health
    ? (HEALTH_COLOR[props.health] ?? "muted")
    : (props.color ?? "muted");
  const size = variant === "filled" ? "md" : (props.size ?? "md");
  return (
    <span
      className={cn(
        "status-pill",
        variant === "filled" && "status-pill--filled",
        size === "md" ? "status-pill--md" : "status-pill--sm",
        variant === "filled" ? FILLED_CLASSES[color] : OUTLINED_CLASSES[color]
      )}
    >
      {children}
    </span>
  );
}
