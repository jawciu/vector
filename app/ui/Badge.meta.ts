import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Any status pill. Badge is the only one in the DS: task statuses via `status`, computed health via `health` (Badge owns both mappings), everything else via the closed `color` union.",
    "Health: outlined where it stands alone (the workspace list Status column, the board header); FILLED in the AI card header, where it sits beside the filled AI trend pill and the two must match in weight. There the trend's arrow is what separates the model judgement from the computed state.",
    "Outlined md (default, 14px) inline in cards and tables: the kanban card chip. Outlined sm (12px) inside dense pickers: the task drawer status menu.",
    "`variant=\"filled\"` for the louder header-level status: the board header blocked-COUNT pill, and health in the AI card header. One size.",
  ],
  dontUseWhen: [
    "A FILLED health pill outside the AI card header. In the list and the board header health is outlined; the filled weight is reserved for the AI header, where it is paired with the trend pill.",
    "Hand-rolling a status chip from STATUS_COLORS. The inline chips in TaskCardView, TaskDrawer, PortalTaskCard, AIDraftInbox and CreateTaskModal, InsightStatusPill, and the board header pills are Phase 7 retrofit targets onto Badge; do not add new ones.",
    "Interactive or removable chips: this is a static label, a <span>, not a button.",
  ],
  a11y: [
    "Colour is never the only signal: the pill's text names the state, so the colour is reinforcement, not information.",
    "Filled text renders in `textDark` on the status colours, class-driven; do not restyle the text colour inline.",
    "Renders a plain <span>: no implicit role, so do not hang click handlers on it (wrap in a Button or IconButton if the state should be actionable).",
  ],
  tokens: [
    "success / danger / alert / action / textMuted / mint / sky / candy",
    "textDark (filled text)",
    "rounded.md (6px)",
  ],
};
