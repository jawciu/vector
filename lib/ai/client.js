/**
 * Anthropic SDK singleton + cost calculation helper.
 *
 * Used by:
 *   - app/api/insights/[scope]/[id]/route.js (Edge runtime — streaming)
 *   - lib/ai/insights.js (Node — non-streaming wrappers, future cron / batch use)
 *
 * The same singleton works in both Edge and Node runtimes — the SDK is
 * isomorphic. Per-runtime DB access differs (Prisma vs Supabase JS), but
 * the Anthropic client is shared.
 */

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  // Don't throw at import time — this file is imported by route handlers and
  // we want a more useful error at the call site if the key is missing.
  console.warn("[lib/ai/client] ANTHROPIC_API_KEY is not set — AI features will fail.");
}

export const anthropic = new Anthropic({ apiKey });

/** Per-token prices in USD, per million tokens. Source: anthropic.com/pricing.
 *  Cache write at 5min TTL is 1.25× input; cache read is 0.1× input. */
const PRICING = {
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
};

/**
 * Compute the dollar cost of a single Anthropic API call from the
 * `usage` object on the response.
 *
 * Falls back to Sonnet 4.6 pricing for unknown models — log a warning so
 * we notice if a new model is being used without updating the table.
 */
export function computeCost(model, usage) {
  const rates = PRICING[model];
  if (!rates) {
    console.warn(`[computeCost] unknown model "${model}", falling back to Sonnet 4.6 pricing`);
  }
  const r = rates ?? PRICING["claude-sonnet-4-6"];
  const inputTokens = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;

  const cost =
    (inputTokens * r.input +
      cacheRead * r.cacheRead +
      cacheWrite * r.cacheWrite +
      outputTokens * r.output) /
    1_000_000;

  return cost;
}
