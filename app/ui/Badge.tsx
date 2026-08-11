import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Badge — DS primitive
 *
 * Generalises the `.status-pill` pattern (globals.css / DESIGN.md "Status
 * pill"): a small cased label communicating state, in two variants.
 *
 *   outlined (default) — transparent, 0.5px border + text in the status
 *     colour (a text-* token utility; the border follows for free through
 *     `currentColor`), matching the existing call sites (InsightCard's
 *     RiskCard severity pill).
 *   filled — the pill fills with the status colour (a bg-* token utility);
 *     text goes `textDark` from the CSS class (InsightStatusPill,
 *     PortfolioInsightsHero's "Declining" pill).
 *
 * `color` is a closed union of status tokens, not a free CSS string, so
 * every badge stays on the documented status palette.
 *
 * StatusBadge.js (task status chips) is untouched — it keeps its own inline
 * style rendering until Phase 7 folds it in here.
 */

export type BadgeColor = "success" | "danger" | "alert" | "action" | "muted";

// Token UTILITIES, not inline var()s — the closed union maps to the @theme
// classes so the DS layer exemplifies the front door it installed.
const OUTLINED_CLASSES: Record<BadgeColor, string> = {
  success: "text-success",
  danger: "text-danger",
  alert: "text-alert",
  action: "text-action",
  muted: "text-text-muted",
};

const FILLED_CLASSES: Record<BadgeColor, string> = {
  success: "bg-success",
  danger: "bg-danger",
  alert: "bg-alert",
  action: "bg-action",
  muted: "bg-text-muted",
};

export interface BadgeProps {
  children: ReactNode;
  /** Status token the pill communicates. Default "muted". */
  color?: BadgeColor;
  /** Louder header-level variant: fills with the colour, text goes dark. */
  filled?: boolean;
}

export default function Badge({
  children,
  color = "muted",
  filled = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "status-pill",
        filled && "status-pill--filled",
        // Outlined: colour via `color` (border rides on currentColor).
        // Filled: colour via `background` (text colour comes from the class).
        filled ? FILLED_CLASSES[color] : OUTLINED_CLASSES[color]
      )}
    >
      {children}
    </span>
  );
}
