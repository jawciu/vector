import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Small state labels inline alongside text or chips — the outlined default (`.status-pill`).",
    "Louder header-level status — `filled` (e.g. the \"Declining\" pill treatment on PortfolioInsightsHero).",
    "Anywhere a new status colour is needed: pick from the closed `color` union (success / danger / alert / action / muted) so pills stay on the documented status palette.",
  ],
  dontUseWhen: [
    "Task status chips (kanban cards, TaskDrawer) — keep using StatusBadge until Phase 7 folds it into Badge; its status → colour mapping (mint/sky/candy) isn't in this union yet.",
    "Vector insight status pills — InsightStatusPill already owns the audience-aware status → token mapping; use it rather than re-deriving colours.",
    "Interactive/removable chips — this is a static label; it renders a <span>, not a button.",
  ],
  a11y: [
    "Colour is never the only signal: the pill's text names the state, so the token colour is reinforcement, not information.",
    "Filled text renders in `textDark` on the status colours (class-driven) — the documented pairings keep contrast; don't restyle the text colour inline.",
    "Renders a plain <span>: no implicit role, so don't hang click handlers on it (wrap in a Button/IconButton if the state should be actionable).",
  ],
  tokens: ["success", "danger", "alert", "action", "textMuted", "textDark (filled text)", "rounded.sm (6px)"],
};
