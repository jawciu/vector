import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Short supplementary hints on hover: what an icon means, why a badge is showing, an AI confidence score (AIDraftInbox), a bounce/invite-failure reason (ContactsPanel).",
    "`label` for one line; `lines` for multi-line hints (one array item per line — `lines` wins over `label` when both are set).",
    "Wrap the trigger element directly — the tooltip body is position:fixed, so it escapes overflow/scroll containers (drawers, tables) without clipping.",
    "Passing neither `label` nor `lines` renders the children untouched (no wrapper) — safe for conditional tooltips.",
  ],
  dontUseWhen: [
    "Information the user MUST see — it is hover-only (see a11y), so keyboard, touch and screen-reader users never get it. Put essential text in the layout instead.",
    "Interactive content (links, buttons) — the body is pointer-events:none and closes the moment the pointer leaves the trigger.",
    "Long prose — the body is white-space:nowrap per line; anything paragraph-length belongs in an InsightCard or inline text.",
  ],
  a11y: [
    "FIXED (2026-08-11, was the lens-3 hover-only gap): the wrapper is focusable (tabIndex 0), focus/blur mirror hover, ESC dismisses, and the open tip is announced via role=tooltip + aria-describedby.",
    "REMAINING GAP: no touch trigger — the content must never be touch-critical (the .health-pill usage still is; Phase 7 gives it a text fallback).",
    "Because of that gap, content must be supplementary only — .health-pill currently hides the entire health rationale behind it (lens-3 gap #6) and is the anti-pattern, not the precedent.",
    "The body is pointer-events:none, so it never traps the pointer or intercepts clicks.",
  ],
  tokens: ["surfaceHover", "border", "textSecondary"],
};
