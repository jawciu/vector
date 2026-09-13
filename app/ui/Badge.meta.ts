import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "experimental",
  useWhen: [
    "Any status pill. Badge is the only one in the DS: task statuses via `status`, computed health via `health` (Badge owns both mappings), everything else via the closed `color` union.",
    "Health, ALWAYS outlined — the workspace list Status column, the board header, the AI card headers. The filled pill on those same three colours is the AI trend pill, so the fill is what separates a computed state from a model judgement.",
    "Outlined md (default, 14px) inline in cards and tables: the kanban card chip. Outlined sm (12px) inside dense pickers: the task drawer status menu.",
    "`variant=\"filled\"` for the louder header-level status: the board header blocked-COUNT pill (a count, not a health state). One size.",
  ],
  dontUseWhen: [
    "A FILLED health pill anywhere. Health is outlined; filled on those colours means the AI trend pill (`InsightStatusPill`), and mixing them makes a computed state look like a model judgement.",
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
