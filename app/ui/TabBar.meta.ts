import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Section-level view switching inside a page, panel or drawer (OnboardingTabs' Overview/Tasks, AdminAITabs, the portal shell) — content swaps in place, the URL doesn't change.",
    "`badge` for pending counts (e.g. unreviewed AI drafts): renders an action-coloured pill next to the label, hidden at 0/null, capped at \"99+\".",
    "`icon` slot for a small leading glyph (14px, currentColor so it follows the label's state colour).",
    "Underline-as-selection (DESIGN.md): the 2px action underline is the ONLY selected cue — inactive labels textMuted, hover textSecondary, active text.",
  ],
  dontUseWhen: [
    "Filtering a list in place — use .filter-pill; tabs imply different views, not a filtered subset.",
    "Route navigation — use links; a TabBar that navigates breaks back-button and open-in-new-tab expectations.",
    "Adding a background pill to the selected tab — the underline is the selection cue, doubling up reads as redundantly selected (DESIGN.md).",
  ],
  a11y: [
    "Each tab is a native <button type=\"button\">, so tabs are individually clickable and reachable with Tab.",
    "KNOWN GAP (lens 3): no tablist semantics — no role=tablist/tab, no aria-selected (selection is a visual data-active only), no arrow-key model. adding the ARIA tabs pattern is a queued reviewed change (post-review round, 2026-08-11); don't bolt roles on per call site.",
    "KNOWN GAP: no focus-visible ring — the shared focus rule covers only the .btn-*/.icon-btn set (lens-3 gap #3), so tab focus falls back to the UA default.",
    "The badge carries aria-label \"<n> pending\", so the count is announced as part of the tab's accessible name.",
  ],
  tokens: ["border", "textMuted", "textSecondary", "text", "action", "actionText"],
};
