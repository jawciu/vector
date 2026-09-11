import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Marking output as AI-generated — every surface where Vector \"speaks\": insight cards, draft cards, the task-drawer follow-up button, the follow-up modal, inline generating indicators.",
    "Generating states: wrap in `.ai-sparkle-twinkle` (spin + pause loop) instead of a generic spinner — more on-brand (DESIGN.md).",
    "Default 16px next to headings; pass smaller `size` (11–14) for inline-text contexts.",
  ],
  dontUseWhen: [
    "Decorative flourish or generic \"magic\" ornament — the sparkle is semantic AI attribution, not decoration; using it elsewhere dilutes the signal.",
    "Re-rolling the star inline as a local SVG — this component is the single source of truth for the gradient; import it so the mark stays identical everywhere.",
    "Status or success/error signalling — use the status pill.",
  ],
  a11y: [
    "`aria-hidden=\"true\"` — purely visual; adjacent text (card title, \"Vector is thinking…\") must carry the AI-attribution meaning for screen readers.",
    "Not interactive: never make the sparkle itself the click target; wrap it in a labelled Button/IconButton instead.",
  ],
  tokens: ["aiGradientFrom", "aiGradientTo"],
};
