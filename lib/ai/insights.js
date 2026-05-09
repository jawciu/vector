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
   - "health_improved" — onboarding's computed health flipped to a better state (Blocked → At risk / On track, or At risk → On track). \`headline\` = "Health", \`detail\` = "moved from <prev> to <new>" (use the exact strings from \`recentWins[].detail\`).
   If \`recentWins\` is empty, return wins: [].
6. \`focusToday[]\` (max 3): cite a specific taskId from the snapshot. \`reason\` (max 120 chars) is WHY this task is the priority today. Rank #1 #2 #3 by impact. Pick blocked, overdue, or critical-path open tasks. Never cite a Done task.
7. \`focusThisWeek[]\` (max 3): strategic priorities for the week, not today's micro-actions. Each item has a \`summary\` (max 140 chars) and a \`priority\`:
   - high = move-the-needle work (rebaseline, escalation, exec sponsor)
   - medium = important coordination
   - low = nice-to-have
8. If signal is low (new onboarding, quiet week), say so in \`summary\` and return short arrays. Do not pad.
9. Tone: clear, direct, slightly punchy. No corporate filler.
10. When referencing a specific task inline in any prose field (\`summary\`, \`risks[].summary\`, \`focusToday[].reason\`, \`focusThisWeek[].summary\`), use the task TITLE wrapped in backticks. Example: "\`Configure SSO with Okta\` is blocked on customer IT." The UI renders backticked spans as monospace chips so the eye finds them. Do NOT backtick people's names, company names, or generic words. ONLY task titles, verbatim from the snapshot. NEVER reference tasks by their numeric id in prose: no "(task 131)", no "task #87", no "(131)" or similar. The taskId belongs in the structured \`focusToday[].taskId\` field, never in human-readable text.

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
9. When referencing a specific task inline in any prose field (\`summary\`, \`priority.items[].issues[]\`, \`wins[].detail\`), use the task TITLE wrapped in backticks. Example: "\`Configure SSO\` blocked at Acme Co". The UI renders backticked spans as monospace chips. Do NOT backtick company names, people's names, or generic words. NEVER reference tasks by numeric id in prose: no "(task 131)", no "task #87", no "(131)". Onboarding ids belong in the structured \`onboardingId\` field, never in human-readable text.

${GLOBAL_RULES}

Today is {{TODAY}}.`;

const PORTAL_RULES = `
RULES — non-negotiable:
1. NEVER invent facts. Every claim must reference a specific taskId or named field from the snapshot. You are talking TO the customer, not ABOUT them — second person ("you", "your team"), warm and clear.
2. \`status\` reflects how the onboarding is going from the customer's point of view. Hard rules:
   - "On track": vendor health is "On track" or "Improving", no overdue customer-owned tasks, work is moving normally.
   - "Needs your input": there is concrete evidence the customer needs to do something — overdue task assigned to a contact, a Blocked task waiting on customer-side action, or customer engagement is dark/cold AND there is open work.
   - "In progress": vendor side would call this "At risk" or "Declining", but no specific customer action is required right now (vendor working through a blocker on their end, slow week, etc.). Default to this when things aren't great but the ball isn't in the customer's court.
3. \`summary\` is ONE plain string (max 220 chars). Address the customer directly. State the most important thing about THEIR onboarding right now — progress so far, what's coming up, or what they need to do. No jargon, no internal vendor language ("escalate", "rebaseline"). If go-live is upcoming, mention it.
4. \`wins[]\` (max 2): each item is a real event from \`recentWins[]\` (last 7 days). Frame as a customer-friendly celebration. Same kind discriminator as vendor side. If \`recentWins\` is empty, return wins: [].
5. \`focusThisWeek[]\` (max 3): general team focus for the week — a mix of items the customer should know about, things their colleagues with portal access are working on, and what the vendor is driving. Address the customer's whole company, not just the current portal user. You may reference other contacts by name when the snapshot makes the assignment clear (e.g. "Maria's team is finalising data mappings"). Each item has a \`summary\` (max 140 chars) and a \`priority\`:
   - high = needs the customer's whole team aligned this week (decisions, sign-off, integration testing)
   - medium = active coordination work
   - low = informational
6. If signal is low (new onboarding, quiet week), say so warmly in \`summary\` and return short arrays. Do not pad.
7. Tone: warm, clear, direct, partnership-flavoured. NOT salesy, NOT corporate. Talk like a thoughtful project lead emailing a customer they like.
8. When referencing a specific task inline in any prose field (\`summary\`, \`wins[].detail\`, \`focusThisWeek[].summary\`), use the task TITLE wrapped in backticks. The UI renders backticked spans as monospace chips. Do NOT backtick people's names, company names, or generic words. NEVER reference tasks by numeric id in prose.

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

const PORTAL_PROMPT = `You are an AI assistant writing customer-facing onboarding summaries inside a portal that the customer can read. You are NOT writing for the vendor — you are writing TO the customer.

You will receive a JSON snapshot of one onboarding (tasks, phases, contacts, health, recent activity). Produce a structured summary in the schema provided, addressed to the customer's team.

The card has four fields:
- status: a customer-friendly trajectory label.
- summary: one warm, direct sentence about where the onboarding stands today, written in second person.
- wins: up to 2 real events from the last 7 days, picked from \`recentWins\`.
- focusThisWeek: up to 3 priorities for the customer's team this week, written in second person; may reference other portal-using contacts by name.
${PORTAL_RULES}`;

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
            enum: ["task_completed", "task_unblocked", "contact_first_login", "health_improved"],
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

const PORTAL_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["On track", "Needs your input", "In progress"],
    },
    summary: { type: "string" },
    wins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["task_completed", "task_unblocked", "contact_first_login", "health_improved"],
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
  required: ["status", "summary", "wins", "focusThisWeek"],
  additionalProperties: false,
};

/** Pick the right schema for the requested scope. */
export function getInsightSchema(scope) {
  if (scope === "portfolio") return PORTFOLIO_SCHEMA;
  if (scope === "portal") return PORTAL_SCHEMA;
  return ONBOARDING_SCHEMA;
}

/** Render the system prompt for the requested scope, with today's date. */
export function renderSystemPrompt(scope, today = new Date()) {
  const base =
    scope === "portfolio" ? PORTFOLIO_PROMPT : scope === "portal" ? PORTAL_PROMPT : ONBOARDING_PROMPT;
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

