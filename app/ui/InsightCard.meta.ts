import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "AI insight surfaces — the vendor onboarding overview (InsightsPanel) and the customer portal overview (PortalOverview) compose these same primitives so both read as one product.",
    "Compose, don't wrap: `InsightCard` shell → `InsightCardHeader` (sparkle + company name + `InsightStatusPill` + the regenerate `IconButton`) → `oi-row` grids of `InsightSection`s holding `RiskCard`/`WinRow`/`FocusTodayItem`/`ThisWeekRow`/`EmptyMessage`.",
    "Pass `isStreaming` to the shell while the insight request is in flight — it owns the rotating gradient border (`.is-streaming`); the streaming/payload state machine stays with the consumer.",
    "Placing a new section: add an `oi-section--<name>` grid-area class in globals.css and slot it into the existing rows.",
  ],
  dontUseWhen: [
    "Non-AI content cards — the gradient dividers and streaming border are the 'AI produced this' signal; borrowing them dilutes it.",
    "A different card shell for an AI surface — never introduce one; extend this card's grid instead (DESIGN.md).",
    "Status pills outside the two blessed vocabularies — `audience=\"vendor\"` (Declining/At risk/On track/Improving) and `audience=\"customer\"` (On track/Needs your input/In progress); unknown statuses fall back to a muted pill.",
  ],
  a11y: [
    "The streaming border honours `prefers-reduced-motion` — the spin pauses, the crossfade still plays.",
    "Status is conveyed by the pill's TEXT, not colour alone; the `.ai-divider` gradient rule is `role=\"separator\"` + `aria-hidden`.",
    "HONEST GAPS (audit Lens 3): the regenerate IconButton sets `aria-busy` and disables while streaming; the streaming label lives in the header text; WinRow/ThisWeekRow position styling is visual grouping only (no list semantics).",
  ],
  tokens: ["aiGradientFrom/aiGradientTo (the ai-gradient pair)", "buttonSecondaryBorder", "borderSubtle", "danger/alert/success/mint (status ramps)", "textMuted"],
};
