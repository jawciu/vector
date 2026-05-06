/**
 * AI orchestrator — single-turn tool-use loop for external events.
 *
 * Phase 3 Path B: We send Claude the FULL meeting transcript alongside
 * Miniti's pre-extracted action_items list, plus the onboarding's open
 * tasks (with description / notes / blockedByTaskId), customer contacts,
 * vendor team users, and phases. Claude emits structured task drafts with
 * ownerId / assigneeContactId / dueDate / blockedByTaskId / notes already
 * filled in.
 *
 * Each tool call from Claude becomes one PendingAIChange row. Caroline
 * approves them in the "Vector suggests" inbox; approval executes via the
 * existing createTask/updateTask paths.
 *
 * Used by:
 *   - app/api/integrations/miniti/webhook/route.js (after the 200 ack)
 *   - future Linear/Attio webhooks (same shape, smaller context payload)
 */

import { anthropic, computeCost } from "@/lib/ai/client";
import { logAICall } from "@/lib/db";
import { GLOBAL_RULES } from "@/lib/ai/global-rules";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are Vector. You process B2B customer onboarding meetings (transcribed by Miniti) and propose structured task drafts that the vendor reviews before applying.

You will receive a JSON context with:
- meeting.title, meeting.date, meeting.summary, meeting.notes
- meeting.transcript: the FULL meeting transcript as a single concatenated string
- meeting.actionItems: Miniti's pre-extracted action items (strings)
- openTasks: existing OPEN tasks for this onboarding, each with id, title, status, phaseId, due, assigneeContactId, description, notes, blockedByTaskId
- customerContacts: [{ id, name, email }] — pick from these for assigneeContactId
- vendorUsers: [{ id, name, email }] — Caroline's team; pick from these for ownerId
- phases: [{ id, name, isComplete }]
- today: today's ISO date

For each concrete action item, emit ONE tool call:
- If it maps to an existing open task by topic, call match_to_existing_task_draft (don't duplicate)
- If it's a new commitment, call create_task_draft
- If someone reports existing work is now done ("data migration is complete"), call update_task_status_draft against the matching task
- If the meeting is a casual catch-up with no firm commitments, call flag_no_action_items

Rules, non-negotiable:

1. Use BOTH signals. You receive the full meeting transcript plus Miniti's pre-extracted action_items list. Both are signal, but you can find action items, owners, deadlines, and dependencies in the transcript that Miniti missed. Use both.

2. Only firm commitments. "We'll send X by Friday" is an action. "We should think about X" is NOT.

3. Match before you create. If an action plausibly maps to an existing open task (use the task's title AND description AND notes), use match_to_existing_task_draft.

4. For every create_task_draft, look across the transcript for:
   - Owner: who said they'd do it. Vendor team-mate (in vendorUsers) sets ownerId. Customer-side person (in customerContacts) sets assigneeContactId. Both can be set if the work is collaborative; usually only one is.
   - Due date: pick it up if explicit ("by Friday", "next Tuesday", "end of Q3"). Resolve to an ISO YYYY-MM-DD relative to today's date. If not mentioned, omit.
   - Dependency: the SINGLE most blocking open task it depends on (blockedByTaskId from openTasks). If multiple things block this work, name the others in notes. If the dependency is external (customer's IT, third-party vendor), leave blockedByTaskId null and put it in notes.
   - Notes: a verbatim transcript snippet (max ~200 chars) that captures the surrounding context (speaker name, exact wording, any caveats).

5. Owner attribution priority:
   a. Explicit name match in transcript ("Marco said he'll send the SOW") picks the matching id from vendorUsers or customerContacts.
   b. Implicit context (the person who owns similar tasks already, the speaker who's been driving that workstream).
   c. Otherwise leave both ownerId and assigneeContactId null. The vendor will fill it in.

6. NEVER guess. If you can't determine a field with reasonable confidence, omit it. The vendor reviews every draft before approving, so missing fields are fine, wrong fields are not.

7. phaseId is REQUIRED on create_task_draft and MUST be from the phases array. Pick the phase that semantically fits (Discovery / Setup / Migration / Go-Live etc.). If unclear, pick the first non-complete phase.

8. Every tool call MUST include sourceQuote, the EXACT verbatim passage (an action_items string OR a transcript snippet) that justifies the action. This is the receipt the vendor reviews.

9. Never invent task ids, contact ids, vendor user ids, or phase ids. Use only ids that appear in the context.

10. Confidence:
    - high   = explicit owner named + clear deadline + unambiguous commitment
    - medium = clear commitment, one of (owner, deadline) inferred or vague
    - low    = implied or ambiguous; flag for the vendor to verify

${GLOBAL_RULES}

Today is {{TODAY}}.`;

const TOOLS = [
  {
    name: "create_task_draft",
    description: "Propose creating a new task. Use when an action item is a fresh commitment not covered by any existing open task. Fill in as many fields as the transcript supports; leave the rest null/omitted.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short imperative task title, max 80 chars.",
        },
        description: {
          type: "string",
          description: "Optional longer description of what the task entails.",
        },
        ownerId: {
          type: "integer",
          description: "Vendor team-mate who owns this work. MUST be an id from vendorUsers. Omit if not determinable.",
        },
        assigneeContactId: {
          type: "integer",
          description: "Customer-side person responsible. MUST be an id from customerContacts. Omit if not determinable.",
        },
        dueDate: {
          type: "string",
          description: "ISO date YYYY-MM-DD if a deadline was committed. Empty string or omit if not.",
        },
        phaseId: {
          type: "integer",
          description: "REQUIRED. Must match a phase id from the phases array.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        blockedByTaskId: {
          type: "integer",
          description: "The single most blocking open task this depends on. MUST be an id from openTasks. Omit if no internal dependency (note external blockers in `notes` instead).",
        },
        notes: {
          type: "string",
          description: "Verbatim transcript snippet (max ~200 chars) capturing speaker, exact wording, and any caveats. Plus any secondary blockers if blockedByTaskId only captures one.",
        },
        sourceQuote: {
          type: "string",
          description: "REQUIRED. Verbatim action_item string OR transcript passage that justifies this draft.",
        },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      required: ["title", "phaseId", "priority", "sourceQuote", "confidence"],
    },
  },
  {
    name: "match_to_existing_task_draft",
    description: "Propose updating an existing open task instead of creating a duplicate. Use when an action item maps to a task already in the openTasks list.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "integer", description: "Must be an id from openTasks" },
        action: {
          type: "string",
          enum: ["comment_only", "reassign", "reprioritise", "update_due_date"],
        },
        commentBody: { type: "string", description: "Comment to add (for comment_only)" },
        newPriority: { type: "string", enum: ["low", "medium", "high"], description: "For reprioritise" },
        newDueDate: { type: "string", description: "ISO date for update_due_date" },
        sourceQuote: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["taskId", "action", "sourceQuote", "confidence"],
    },
  },
  {
    name: "update_task_status_draft",
    description: "Propose marking an existing task as Done (or another status) when the transcript reports completion.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "integer", description: "Must be an id from openTasks" },
        newStatus: {
          type: "string",
          enum: ["Not started", "In progress", "Under investigation", "Blocked", "Done"],
        },
        sourceQuote: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["taskId", "newStatus", "sourceQuote", "confidence"],
    },
  },
  {
    name: "flag_no_action_items",
    description: "Call exactly once if the meeting has no concrete action items worth surfacing.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Brief explanation (e.g. 'casual catch-up', 'all items already covered by existing tasks')" },
      },
      required: ["reason"],
    },
  },
];

/**
 * Run the orchestrator for a Miniti meeting.
 * Returns an array of normalised tool calls + the cost / usage info.
 *
 *   { calls: [{ tool, input }], usage, model, requestId, durationMs }
 */
export async function runMinitiOrchestrator({ context, kind = "transcript" }) {
  const startedAt = Date.now();
  const today = new Date(context.today || new Date().toISOString().slice(0, 10));
  const systemPrompt = SYSTEM_PROMPT.replace("{{TODAY}}", today.toISOString().slice(0, 10));

  // Cheap pre-flight log — useful when debugging "why did Claude only get 2
  // tool calls back" (almost always: context too small, or all openTasks
  // already covered the action items). 4-chars-per-token is a coarse
  // approximation but fine for ballpark.
  const approxTokens = Math.ceil(JSON.stringify(context).length / 4);
  console.log(
    `[miniti] orchestrator: input ${approxTokens} prompt tokens, ` +
      `${context.openTasks?.length ?? 0} open tasks, ` +
      `${context.customerContacts?.length ?? 0} contacts`
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(context) }],
    tools: TOOLS,
  });

  const calls = response.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ tool: b.name, input: b.input, id: b.id }));

  console.log(
    `[miniti] orchestrator: ${response.content.length} content blocks, ` +
      `${calls.length} tool calls`
  );

  const durationMs = Date.now() - startedAt;

  // Log cost regardless of whether we got tool calls or not.
  await logAICall({
    kind,
    scopeId: String(context.meeting?.id ?? ""),
    model: response.model,
    inputTokens: response.usage.input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    costUsd: computeCost(response.model, response.usage),
    durationMs,
    requestId: response.id,
  }).catch((err) => console.warn("[orchestrator] logAICall failed", err));

  return {
    calls,
    usage: response.usage,
    model: response.model,
    requestId: response.id,
    durationMs,
    stopReason: response.stop_reason,
  };
}

/**
 * Map a Claude tool call to the PendingAIChange.action enum.
 */
export function toolCallToAction(toolName) {
  switch (toolName) {
    case "create_task_draft": return "create_task";
    case "match_to_existing_task_draft": return "match_existing";
    case "update_task_status_draft": return "update_status";
    case "flag_no_action_items": return "no_action";
    default: throw new Error(`unknown tool ${toolName}`);
  }
}
