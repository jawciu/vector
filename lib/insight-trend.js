/**
 * Vendor insight TREND vocabulary.
 *
 * The AI insight pill states the direction of travel only. Health
 * ("On track" / "At risk" / "Blocked") is computed deterministically by
 * `lib/health.js` and is the ONLY place that vocabulary belongs, so the two
 * signals can never be confused for one another.
 *
 * Shared by the model schema (`lib/ai/insights.js`) and the pill
 * (`app/ui/InsightCard.js`) so there is one source of truth.
 */

/** The only values the vendor `status` field may hold. */
export const TREND_VALUES = ["improving", "steady", "declining"];

/** Neutral value used when a stored trend cannot be recognised. */
export const DEFAULT_TREND = "steady";

/**
 * Insights cached before the trend rename hold the old mixed vocabulary.
 * Map them onto the nearest trend so old cards keep rendering. "At risk"
 * and "On track" were health words, so they map to the trend the model
 * would most likely have meant, not to a health state.
 */
const LEGACY_TREND_MAP = {
  declining: "declining",
  improving: "improving",
  "at risk": "declining",
  "on track": "steady",
  steady: "steady",
};

/**
 * Coerce any stored or model-supplied value to a trend.
 * Returns null when the value is not recognised, so callers choose their
 * own fallback (the pill renders muted, the parser uses DEFAULT_TREND).
 */
export function normaliseTrend(value) {
  if (typeof value !== "string") return null;
  return LEGACY_TREND_MAP[value.trim().toLowerCase()] ?? null;
}
