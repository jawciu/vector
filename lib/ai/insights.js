/**
 * AI insights generator — system prompts, JSON schemas, payload helpers.
 *
 * Same shape across scopes (onboarding + portfolio); items reference
 * different IDs:
 *   - Onboarding: focusToday[].taskId, nudges[].taskId
 *   - Portfolio: focusToday[].onboardingId, nudges[].onboardingId
 *
 * The actual streaming call happens in
 *   app/api/insights/[scope]/[id]/route.js
 * which is Edge-runtime and imports from this file.
 */

const SHARED_RULES = `
RULES — non-negotiable:
1. NEVER invent facts. Every claim must reference a specific id (taskId / onboardingId) or named field from the snapshot.
2. "Risk" means concrete evidence something will go wrong. "Could become a problem later" with no evidence = NOT a risk.
3. "Win" means something objectively went well in the last 7 days.
4. \`focusThisWeek\` is for strategic priorities, not today's micro-actions.
5. \`nudges[]\` items are pre-detected by our system — RANK (pick the 2-3 most important) and REPHRASE (in Vector's voice). Do not invent nudges.
6. If signal is low (new onboarding, quiet week), say so — do not pad.
7. Tone: clear, direct, slightly punchy. No corporate filler.
8. Length caps: headline 80 chars, tldr 200 chars, focusToday[].reason 120 chars, focusThisWeek[].summary 140 chars, risks[].summary 140 chars.

Today is {{TODAY}}.`;

const ONBOARDING_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to help the vendor understand the state of an onboarding at a glance and decide what to focus on today and this week.

You will receive a JSON snapshot of one onboarding. Produce a structured summary in the schema provided.

Every action item in \`focusToday\` MUST cite a specific taskId.
${SHARED_RULES}`;

const PORTFOLIO_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to give a portfolio-level overview across ALL active onboardings — which customers need attention today, which are coming up this week, and where the biggest risks are.

You will receive a JSON snapshot summarising every active onboarding (one line per onboarding, no individual tasks). Produce a structured summary in the schema provided.

Every action item in \`focusToday\` MUST cite a specific onboardingId. The \`reason\` should describe why this onboarding deserves attention (e.g. "blocked task pile + customer dark for 12 days"). \`focusThisWeek\` is for strategic priorities across the book — e.g. "3 onboardings approach go-live in the next 10 days, plan resourcing".
${SHARED_RULES}`;

const ONBOARDING_SCHEMA = {
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
        properties: { summary: { type: "string" } },
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

const PORTFOLIO_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    tldr: { type: "string" },
    focusToday: {
      type: "array",
      items: {
        type: "object",
        properties: {
          onboardingId: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["onboardingId", "reason"],
        additionalProperties: false,
      },
    },
    focusThisWeek: {
      type: "array",
      items: {
        type: "object",
        properties: { summary: { type: "string" } },
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
          onboardingId: { type: "integer" },
        },
        required: ["severity", "summary", "evidence"],
        additionalProperties: false,
      },
    },
    wins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          summary: { type: "string" },
          onboardingId: { type: "integer" },
        },
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
          onboardingId: { type: "integer" },
          summary: { type: "string" },
          ctaTarget: { type: "string", enum: ["draft_followup", "open_onboarding"] },
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

/** Pick the right schema for the requested scope. */
export function getInsightSchema(scope) {
  return scope === "portfolio" ? PORTFOLIO_SCHEMA : ONBOARDING_SCHEMA;
}

/** Render the system prompt for the requested scope, with today's date. */
export function renderSystemPrompt(scope, today = new Date()) {
  const base = scope === "portfolio" ? PORTFOLIO_PROMPT : ONBOARDING_PROMPT;
  return base.replace("{{TODAY}}", today.toISOString().slice(0, 10));
}

/** Build the user message Claude receives. */
export function buildUserMessage(snapshot) {
  return JSON.stringify(snapshot);
}

/** Pull the JSON payload out of a complete Anthropic message. */
export function parseInsightPayload(message) {
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Claude response");
  return JSON.parse(textBlock.text);
}

/* Deprecated single-scope exports — keep around briefly so any leftover imports
 * don't break, then delete in a follow-up. */
export const SYSTEM_PROMPT = ONBOARDING_PROMPT;
export const INSIGHT_SCHEMA = ONBOARDING_SCHEMA;
