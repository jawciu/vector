/**
 * AI insights generator — system prompts, JSON schemas, payload helpers.
 *
 * Onboarding and portfolio scopes have separate prompts + schemas; both
 * inherit GLOBAL_RULES. The streaming call happens in
 *   app/api/insights/[scope]/[id]/route.js
 * which is Edge-runtime and imports from this file.
 */

import { GLOBAL_RULES } from "./global-rules.js";

const ONBOARDING_RULES = `
RULES — non-negotiable:
1. NEVER invent facts. Every claim must reference a specific taskId or named field from the snapshot.
2. \`status\` reflects this onboarding's trajectory. Hard rules:
   - "Declining": health = "Blocked" OR multiple new blocked tasks in the last 7 days OR overdue task count grew OR customer engagement bucket flipped to "dark".
   - "At risk": health = "At risk" with concrete signals (1+ blocked task, 1+ overdue task, customer cold/dark) and no positive recent change.
   - "On track": health = "On track" and no concrete risk signals; work progressing normally.
   - "Improving": positive movement in the last 7 days (recent task completions OR a Blocked task moved to In progress OR a phase advanced OR health flipped from a worse state) AND no high-severity active risks.
3. \`summary\` is ONE plain string (max 220 chars). State the most important thing about this onboarding right now. No headline, no list.
4. \`risks[]\` (max 3): each item is concrete evidence something will go wrong, with severity. "Could become a problem later" without evidence is NOT a risk.
   - severity = high: Blocked task with no documented blocker, overdue by 7+ days, missed go-live, dark customer with critical work outstanding.
   - severity = medium: Overdue 1-6 days, customer cold (4-7 days since last seen), unassigned high-priority task.
   - severity = low: Soft signals only.
5. \`wins[]\` (max 2): each item is a real event from the snapshot's \`recentWins[]\` field (last 7 days). Do NOT invent. Pick the 1-2 most meaningful. Each win has a \`kind\` discriminator:
   - "task_completed" — task moved to Done. \`headline\` = task title, \`detail\` = "moved to complete".
   - "task_unblocked" — task moved Blocked → In progress / Under investigation. \`headline\` = task title, \`detail\` = "unblocked, now <new status lowercased>".
   - "contact_first_login" — contact's first portal login. \`headline\` = contact name, \`detail\` = "opened their portal for the first time".
   If \`recentWins\` is empty, return wins: [].
6. \`focusToday[]\` (max 3): cite a specific taskId from the snapshot. \`reason\` (max 120 chars) is WHY this task is the priority today. Rank #1 #2 #3 by impact. Pick blocked, overdue, or critical-path open tasks. Never cite a Done task.
7. \`focusThisWeek[]\` (max 3): strategic priorities for the week, not today's micro-actions. Each item has a \`summary\` (max 140 chars) and a \`priority\`:
   - high = move-the-needle work (rebaseline, escalation, exec sponsor)
   - medium = important coordination
   - low = nice-to-have
8. If signal is low (new onboarding, quiet week), say so in \`summary\` and return short arrays. Do not pad.
9. Tone: clear, direct, slightly punchy. No corporate filler.

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

const ONBOARDING_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to help the vendor understand the state of one customer's onboarding at a glance and decide what to focus on today and this week.

You will receive a JSON snapshot of one onboarding (tasks, phases, contacts, health, recent activity). Produce a structured summary in the schema provided.

The card has six fields:
- status: a single trajectory label shown as a pill in the header.
- summary: one operator-friendly sentence about where this onboarding stands today.
- risks: up to 3 concrete risks with severity.
- wins: up to 2 real events from the last 7 days, picked from the pre-computed \`recentWins\` snapshot field.
- focusToday: up to 3 specific taskIds to act on today, each with a one-line reason.
- focusThisWeek: up to 3 strategic priorities for the week, each with a priority level.
${ONBOARDING_RULES}`;

const PORTFOLIO_PROMPT = `You are Vector, an AI assistant inside an onboarding workflow tool used by B2B vendors to manage customer onboardings. Your job is to give a portfolio-level overview across ALL active onboardings.

You will receive a JSON snapshot summarising every active onboarding (one line per onboarding, no individual tasks). Produce a structured summary in the schema provided.

The card has three sections: a one-line summary, a priority section (either Risk focus when concrete risks exist, or Focus this week otherwise), and an optional Wins section (last 7 days only).
${PORTFOLIO_RULES}`;

const ONBOARDING_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["Declining", "At risk", "On track", "Improving"],
    },
    summary: { type: "string" },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          summary: { type: "string" },
        },
        required: ["severity", "summary"],
        additionalProperties: false,
      },
    },
    wins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["task_completed", "task_unblocked", "contact_first_login"],
          },
          taskId: { type: "integer" },
          contactId: { type: "integer" },
          headline: { type: "string" },
          detail: { type: "string" },
        },
        required: ["kind", "headline", "detail"],
        additionalProperties: false,
      },
    },
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
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["summary", "priority"],
        additionalProperties: false,
      },
    },
  },
  required: ["status", "summary", "risks", "wins", "focusToday", "focusThisWeek"],
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

