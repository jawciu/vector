import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Showing the human-readable task identifier (e.g. `AC-12`) before a task title, anywhere a task title renders: kanban card, drawer header, blocked-by row, AI draft references, portal task card.",
    "Always pass the task object — the chip reads `task.taskId`, the single source of truth composed server-side (lib/db.js#mapTask from company.prefix + task.number). Never compose the id string yourself.",
  ],
  dontUseWhen: [
    "Arbitrary inline metadata or labels — this chip is specifically the task identifier, not a generic mono tag.",
    "Task status — use the status pill.",
    "Standalone display without the title next to it — the chip is a prefix, not an identifier badge on its own.",
  ],
  a11y: [
    "Plain inline <span>: read by screen readers as part of the title text it prefixes, no interactive semantics to uphold.",
    "Renders null when the task has no taskId — callers don't need to guard, layout degrades gracefully.",
  ],
  tokens: ["textMuted"],
};
