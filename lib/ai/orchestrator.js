/**
 * AI orchestrator — single-turn tool-use loop for external events.
 *
 * Phase 3 Path A: Miniti delivers pre-extracted action_items[]. Our job is
 * to match each action item to an existing open task OR create a new task
 * draft, attributing owner from context. We deliberately don't re-extract
 * from the raw transcript at v1 — Path B (full transcript + multi-step
 * thinking) is deferred (see plan).
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

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are Vector. You process pre-extracted action items from a B2B customer onboarding meeting (transcribed by Miniti) and propose task drafts that the vendor reviews before applying.

You will receive: the meeting metadata, Miniti's pre-extracted action_items list (strings), the list of existing OPEN tasks for this onboarding (with ids, titles, statuses, phaseIds), the customer contacts list, the phases list, and today's date.

For each action item, emit ONE tool call:
- If it maps to an existing open task by topic, call match_to_existing_task_draft (don't duplicate)
- If it's a new commitment, call create_task_draft
- If someone reports something is already done ("data migration is complete"), call update_task_status_draft against the matching task
- If the action item is too vague to action (e.g. "discuss next steps"), skip it

If the action_items list is empty or all items are too vague, call flag_no_action_items.

Rules — non-negotiable:
1. Only firm commitments. "We'll send X by Friday" → action. "We should think about X" → NOT an action.
2. Match before you create. If an action item plausibly maps to an existing open task, use match_to_existing_task_draft.
3. Every tool call MUST include sourceQuote — the EXACT action_item string from the input (verbatim). This is the receipt Caroline reviews.
4. owner attribution: if the action item explicitly names a customer contact or implies them as the actor, owner is "customer". Otherwise default to "vendor" (Caroline's team is the assumed owner).
5. Confidence:
   - high = explicit owner + clear deadline in the action item text
   - medium = clear commitment, vague timing
   - low = implied or ambiguous
6. phaseId on create_task_draft must be one of the phase ids provided in context. If you can't tell which phase, pick the first non-complete phase.
7. Never invent task ids. Use only ids from the openTasks list.

Today is {{TODAY}}.`;

const TOOLS = [
  {
    name: "create_task_draft",
    description: "Propose creating a new task. Use when an action item is a fresh commitment not covered by any existing open task.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short imperative task title (max ~80 chars)" },
        description: { type: "string", description: "Optional longer description" },
        owner: { type: "string", enum: ["vendor", "customer"], description: "Who owns this work" },
        dueDate: { type: "string", description: "ISO date YYYY-MM-DD if mentioned, else empty string" },
        phaseId: { type: "integer", description: "Must match a phase id from the context" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        sourceQuote: { type: "string", description: "Exact action_item string this draft came from" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["title", "owner", "phaseId", "priority", "sourceQuote", "confidence"],
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
        newOwner: { type: "string", enum: ["vendor", "customer"], description: "For reassign" },
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
    description: "Propose marking an existing task as Done (or another status) when the action item reports completion.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "integer" },
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
