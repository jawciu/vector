import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Rendering AI prose that may contain backtick-wrapped task-title references (insight summaries, risk reasons, portal overviews, portfolio hero lines) — the insight prompts instruct the model to backtick task titles; this is THE render helper that turns them into `.task-ref` chips.",
    "Any new AI-text surface: use this instead of re-implementing backtick splitting so refs stay visually consistent (and keep wrapping mid-title via box-decoration-break).",
  ],
  dontUseWhen: [
    "General markdown — it only handles single-backtick spans, nothing else.",
    "User-authored content — the backtick convention is an AI-prompt contract, not a user-facing syntax.",
    "Making refs clickable — the chips are plain spans today; if navigation is needed, that's a new component, not an onClick on this one.",
  ],
  a11y: [
    "Outputs nested <span>s only — inherits the surrounding paragraph's semantics; refs are announced as ordinary text.",
    "Renders null for empty/missing text — callers don't need to guard.",
  ],
  tokens: ["surfaceHover", "text"],
};
