import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "AI insight surfaces — the vendor onboarding overview (InsightsPanel) and the customer portal overview (PortalOverview) compose these same primitives so both read as one product.",
    "Compose, don't wrap: `InsightCard` shell → `InsightCardHeader` (sparkle + company name + `InsightStatusPill` + the regenerate `IconButton`) → `oi-row` grids of `InsightSection`s holding `RiskCard`/`WinRow`/`FocusTodayItem`/`ThisWeekRow`/`EmptyMessage`.",
    "Onboarding headers show a pair: `healthPill` (an outlined `Badge health={…}`) then `statusPill` (the filled trend). Showing them together is what stops the trend being read as health. The portfolio header shows the trend only (there is no portfolio-level health; the table below carries each onboarding's).",
    "Pass `isStreaming` to the shell while the insight request is in flight — it owns the rotating gradient border (`.is-streaming`); the streaming/payload state machine stays with the consumer.",
    "Placing a new section: add an `oi-section--<name>` grid-area class in globals.css and slot it into the existing rows.",
  ],
  dontUseWhen: [
    "Non-AI content cards — the gradient dividers and streaming border are the 'AI produced this' signal; borrowing them dilutes it.",
    "A different card shell for an AI surface — never introduce one; extend this card's grid instead (DESIGN.md).",
    "Status pills outside the two blessed vocabularies — `audience=\"vendor\"` is a TREND only (an arrow plus improving/steady/declining) and `audience=\"customer\"` (On track/Needs your input/In progress); unknown statuses fall back to a muted pill.",
    "Health in the vendor pill — health (On track/At risk/Blocked) is computed by `lib/health.js` and rendered by its own pills; the AI pill must never restate it. Legacy cached values are mapped onto a trend, not shown as-is.",
    "A filled health pill, or a trend pill without its arrow — the two families share three colours deliberately, so the fill and the `TrendArrowIcon` are the only things telling them apart. Never swap either, and never re-colour one family to force a difference.",
  ],
  a11y: [
    "The streaming border honours `prefers-reduced-motion` — the spin pauses, the crossfade still plays.",
    "Status is conveyed by the pill's TEXT, not colour alone, and the vendor pill carries a hidden \"Trend: \" prefix so its accessible name reads \"Trend: improving\" — the arrow is aria-hidden, so without it a screen reader would hear a bare word that could pass for health; the `.ai-divider` gradient rule is `role=\"separator\"` + `aria-hidden`.",
    "HONEST GAPS (audit Lens 3): the regenerate IconButton sets `aria-busy` and disables while streaming; the streaming label lives in the header text; WinRow/ThisWeekRow position styling is visual grouping only (no list semantics).",
  ],
  tokens: ["success/alert/danger (the trend pill borrows health's three)", "aiGradientFrom/aiGradientTo (the ai-gradient pair)", "buttonSecondaryBorder", "borderSubtle", "danger/alert/success/mint (status ramps)", "textMuted"],
};
