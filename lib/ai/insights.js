/**
 * AI insights generator — system prompts, JSON schemas, payload helpers.
 *
 * Onboarding and portfolio scopes have separate prompts + schemas; both
 * inherit GLOBAL_RULES. The streaming call happens in
 *   app/api/insights/[scope]/[id]/route.js
 * which is Edge-runtime and imports from this file.
 */

import { GLOBAL_RULES } from "./global-rules.js";

const SHARED_RULES = `
RULES — non-negotiable:
1. NEVER invent facts. Every claim must reference a specific id (taskId / onboardingId) or named field from the snapshot.
2. "Risk" means concrete evidence something will go wrong. "Could become a problem later" with no evidence = NOT a risk.
3. "Win" means something objectively went well in the last 7 days.
4. \`focusThisWeek\` is for strategic priorities, not today's micro-actions.
5. \`nudges[]\` items are pre-detected by our system. RANK (pick the 2-3 most important) and REPHRASE (in Vector's voice). Do not invent nudges.
6. If signal is low (new onboarding, quiet week), say so. Do not pad.
7. Tone: clear, direct, slightly punchy. No corporate filler.
8. Length caps: headline 80 chars, tldr 200 chars, focusToday[].reason 120 chars, focusThisWeek[].summary 140 chars, risks[].summary 140 chars.

${GLOBAL_RULES}

Today is {{TODAY}}.`;

const PORTFOLIO_RULES = `
RULES — non-negotiable:
1. NEVER invent facts. Every claim must reference a specific onboardingId or named field from the snapshot.
2. \`status\` reflects the overall portfolio trajectory:
   - "Declining": multiple onboardings worsened in the last 7 days, or any active onboarding is in critical state.
   - "At risk": one or more onboardings show concrete risk signals (blocked, overdue, dark customer).
   - "On track": no active risk signals, work is progressing normally.
   - "Improving": multiple onboardings recovered or advanced phase in the last 7 days.
3. \`summary\` is ONE plain string (max 220 chars). No headline, no list. State the most important thing about the portfolio right now.
4. \`priority.mode\` discriminator:
   - "risk" when there is concrete evidence of trouble (blocked tasks, overdue work, dark customers, missed go-lives). Populate \`priority.items[]\` with up to 3 onboardings ranked by severity.
   - "focus" when no concrete risks exist. Populate \`priority.items[]\` with up to 3 onboardings to focus on this week (closest go-live, most active phase, etc.).
5. Each \`priority.items[].issues[]\` is 1-3 short bullet strings (max 80 chars each). Concrete signals only ("3 of 9 tasks blocked", "customer dark for 12 days"). No advice, no opinions.
6. \`wins[]\` (max 2): each item is a real event from the last 7 days, anchored on the snapshot field \`recentCompletions7d\` (count of tasks marked Done in the last 7 days) and \`recentCompletionTitles\` (a few of the titles). Pick the 1-2 onboardings with the highest \`recentCompletions7d\`. \`headline\` is the company name. \`detail\` is what they shipped, paraphrased from \`recentCompletionTitles\` (e.g. "completed integration phase, 4 tasks closed this week"). If no onboarding has \`recentCompletions7d > 0\`, return wins: []. NEVER invent a win that isn't backed by these fields.
7. If signal is low, say so in \`summary\` and return short \`priority.items[]\`. Do not pad.
8. Tone: clear, direct, slightly punchy. No corporate filler.

${GLOBAL_RULES}

Today is {{TODAY}}.`;

const ONBOARDING_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to help the vendor understand the state of an onboarding at a glance and decide what to focus on today and this week.

You will receive a JSON snapshot of one onboarding. Produce a structured summary in the schema provided.

Every action item in \`focusToday\` MUST cite a specific taskId.
${SHARED_RULES}`;

const PORTFOLIO_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to give a portfolio-level overview across ALL active onboardings.

You will receive a JSON snapshot summarising every active onboarding (one line per onboarding, no individual tasks). Produce a structured summary in the schema provided.

The card has three sections: a one-line summary, a priority section (either Risk focus when concrete risks exist, or Focus this week otherwise), and an optional Wins section (last 7 days only).
${PORTFOLIO_RULES}`;

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
    status: {
      type: "string",
      enum: ["Declining", "At risk", "On track", "Improving"],
    },
    summary: { type: "string" },
    priority: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["risk", "focus"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              onboardingId: { type: "integer" },
              issues: { type: "array", items: { type: "string" } },
            },
            required: ["onboardingId", "issues"],
            additionalProperties: false,
          },
        },
      },
      required: ["mode", "items"],
      additionalProperties: false,
    },
    wins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          onboardingId: { type: "integer" },
          headline: { type: "string" },
          detail: { type: "string" },
        },
        required: ["onboardingId", "headline", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["status", "summary", "priority", "wins"],
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
