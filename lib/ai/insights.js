/**
 * AI insights generator — system prompt, JSON schema, payload helpers.
 *
 * The actual streaming call happens in
 *   app/api/insights/[scope]/[id]/route.js
 * which is Edge-runtime and imports from this file.
 */

export const SYSTEM_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to help the vendor understand the state of an onboarding at a glance and decide what to focus on today and this week.

You will receive a JSON snapshot of one onboarding. Produce a structured summary in the schema provided.

RULES — non-negotiable:
1. NEVER invent facts. Every claim must reference a specific taskId or named field from the snapshot.
2. Every action item in \`focusToday\` MUST cite a specific taskId.
3. "Risk" means concrete evidence something will go wrong. "Could become a problem later" with no evidence = NOT a risk.
4. "Win" means something objectively went well in the last 7 days.
5. \`focusThisWeek\` is for strategic priorities, not today's micro-actions.
6. \`nudges[]\` items are pre-detected by our system — RANK (pick the 2-3 most important) and REPHRASE (in Vector's voice). Do not invent nudges.
7. If signal is low (new onboarding, quiet week), say so — do not pad.
8. Tone: clear, direct, slightly punchy. No corporate filler.
9. Length caps: headline 80 chars, tldr 200 chars, focusToday[].reason 120 chars, focusThisWeek[].summary 140 chars, risks[].summary 140 chars.

Today is {{TODAY}}.`;

/** JSON schema enforced server-side via output_config.format.
 *  Note: `maxLength` and `maxItems` are NOT supported by Anthropic's
 *  structured outputs (only basic types + enums + additionalProperties:false).
 *  Length / count caps are enforced via the system prompt instead. */
export const INSIGHT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    tldr: { type: "string" },
    focusToday: {
      type: "array",
      items: {
        type: "object",
        properties: {
          taskId: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["taskId", "reason"],
        additionalProperties: false,
      },
    },
    focusThisWeek: {
      type: "array",
      items: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
        additionalProperties: false,
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          summary: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["severity", "summary", "evidence"],
        additionalProperties: false,
      },
    },
    wins: {
      type: "array",
      items: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
    },
    nudges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["unassigned_task", "follow_up", "stale_task", "customer_dark"],
          },
          taskId: { type: "integer" },
          contactId: { type: "integer" },
          summary: { type: "string" },
          ctaTarget: { type: "string", enum: ["draft_followup", "open_task", "open_contact"] },
        },
        required: ["kind", "summary"],
        additionalProperties: false,
      },
    },
    trend: { type: "string", enum: ["improving", "stable", "declining"] },
  },
  required: ["headline", "tldr", "focusToday", "focusThisWeek", "risks", "wins", "nudges", "trend"],
  additionalProperties: false,
};

/**
 * Build the user message Claude receives. Today's date is injected here
 * (cheap to vary per-call, doesn't break system-prompt cache).
 */
export function buildUserMessage(snapshot) {
  return JSON.stringify(snapshot);
}

/**
 * Render the system prompt with today's date. The {{TODAY}} placeholder
 * is the only dynamic part — everything else stays cache-stable.
 */
export function renderSystemPrompt(today = new Date()) {
  return SYSTEM_PROMPT.replace("{{TODAY}}", today.toISOString().slice(0, 10));
}

/**
 * Pull the JSON payload out of a complete Anthropic message. Handles the
 * case where structured-output is returned as a single text block.
 */
export function parseInsightPayload(message) {
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Claude response");
  return JSON.parse(textBlock.text);
}
