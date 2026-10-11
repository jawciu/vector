/**
 * Global AI rules — applied to every Vector prompt across the system.
 * Imported by insights.js, followup.js, scan-stale.js, orchestrator.js.
 *
 * Keep this short. Anything specific to a single feature lives in that
 * feature's prompt.
 */

export const GLOBAL_RULES = `
GLOBAL RULES — apply to all output:
- Never use em dashes (—) or en dashes (–). Use commas, periods, parentheses, or "and" instead.
`.trim();
