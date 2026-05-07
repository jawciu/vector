/**
 * AI orchestrator — two-pass pipeline for Miniti meetings.
 *
 * Phase 3 Path B (split for observability + tunability):
 *
 *   Pass 1 — runMinitiExtraction (Sonnet 4.6, no tools)
 *     Pure extraction: scan the full transcript + Miniti's action_items
 *     and produce a structured "facts" payload — claims, source quotes,
 *     mentioned owners/dates/dependencies as VERBATIM text. No decisions
 *     about whether to create / match / skip. Output stored on
 *     ExternalEvent.orchestratorExtraction.
 *
 *   Pass 2 — runMinitiOrchestrator (Sonnet 4.6, tool-use)
 *     Decision: take Pass 1's facts plus the onboarding context (open
 *     tasks, vendor users, contacts, phases) and emit tool calls
 *     (create_task / match_existing / update_status / flag_no_action_items).
 *     Resolves mentioned-text into ids. Output stored as
 *     ExternalEvent.orchestratorOutput.
 *
 * Why split: when a draft looks wrong, the operator can tell whether
 * Pass 1 missed the action (re-tune extraction prompt) or Pass 2 made
 * the wrong call (re-tune decision prompt). Single-pass blurs the two.
 *
 * Each Pass-2 tool call becomes one PendingAIChange row.
 *
 * Used by:
 *   - app/api/integrations/miniti/webhook/route.js (after the 200 ack)
 *   - future Linear/Attio webhooks (same shape, smaller context payload)
 */

import { anthropic, computeCost } from "@/lib/ai/client";
import { logAICall } from "@/lib/db";
import { GLOBAL_RULES } from "@/lib/ai/global-rules";

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Pass 1 — Extraction
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are Vector. Your job is FACT EXTRACTION from a B2B onboarding meeting (transcribed by Miniti). You do NOT decide what to do with the facts; another step takes care of that. Just find them faithfully.

You will receive a JSON context with:
- meeting.title, meeting.date, meeting.summary, meeting.notes
- meeting.transcript: the FULL meeting transcript as a single concatenated string
- meeting.actionItems: Miniti's pre-extracted action items (strings)
- openTasks, customerContacts, vendorUsers, phases (for reference only — DO NOT resolve to ids in this pass)
- today: today's ISO date

Produce a single JSON object with these arrays:

actionItems[]: every concrete commitment surfaced anywhere in the transcript or in meeting.actionItems. For each one capture:
  - claim: a short imperative summary of what was committed to ("Send security questionnaire").
  - sourceQuote: the EXACT verbatim passage from the transcript or action_items list that justifies the claim.
  - speaker: who said it (use the name from the transcript verbatim, e.g. "Ian Ahuja", "Marco", "unknown" if not attributable).
  - mentionedOwner: the name of the person who said they'd do it, VERBATIM from the transcript ("Marco", "Ian", "the customer's IT team", or "" if not mentioned). DO NOT resolve to an id.
  - mentionedDueDate: VERBATIM date phrasing ("by Friday", "next week", "end of Q3") or "" if no deadline mentioned. DO NOT convert to ISO.
  - mentionedDependency: VERBATIM phrasing of any blocker mentioned ("blocked on the SSO setup", "waiting for legal sign-off") or "" if no dependency mentioned. DO NOT match to a task id.
  - firmness: "firm" (clear commitment with timing or owner), "tentative" (commitment but vague timing/owner), "vague" (someone mused about it but didn't commit).
  - notesSnippet: ~200 char verbatim transcript window around the commitment so the next pass has surrounding context.

reportedCompletions[]: every claim that an existing piece of work is now done. ("Data migration is complete", "we've signed the DPA"). Each item has:
  - claim, sourceQuote, speaker.

externalBlockers[]: external blockers mentioned that aren't tasks ("customer's IT team is non-responsive", "legal review delays"). Just short strings.

meetingTone: a single short label — one of "kickoff", "status update", "casual catchup", "escalation", "planning", "review", "other".

Rules:
1. Be FAITHFUL. Every actionItem must point to a sourceQuote that's literally present in the transcript or action_items. If you can't quote it, don't surface it.
2. Capture EVERYTHING. Err on the side of including marginal items — Pass 2 decides whether they make it through.
3. Keep mentioned-* fields as VERBATIM TEXT. Do NOT resolve names to ids, do NOT convert dates to ISO. That's Pass 2's job.
4. If meeting.actionItems already lists an item that you find in the transcript too, surface it once with the most informative sourceQuote.
5. If the meeting has zero firm commitments (e.g. casual catch-up), return actionItems: [] and let meetingTone tell the story.

${GLOBAL_RULES}

Today is {{TODAY}}.`;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          sourceQuote: { type: "string" },
          speaker: { type: "string" },
          mentionedOwner: { type: "string" },
          mentionedDueDate: { type: "string" },
          mentionedDependency: { type: "string" },
          firmness: { type: "string", enum: ["firm", "tentative", "vague"] },
          notesSnippet: { type: "string" },
        },
        required: ["claim", "sourceQuote", "firmness"],
        additionalProperties: false,
      },
    },
    reportedCompletions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          sourceQuote: { type: "string" },
          speaker: { type: "string" },
        },
        required: ["claim", "sourceQuote"],
        additionalProperties: false,
      },
    },
    externalBlockers: {
      type: "array",
      items: { type: "string" },
    },
    meetingTone: {
      type: "string",
      enum: ["kickoff", "status update", "casual catchup", "escalation", "planning", "review", "other"],
    },
  },
  required: ["actionItems", "reportedCompletions", "externalBlockers", "meetingTone"],
  additionalProperties: false,
};

/**
 * Pass 1: extract structured facts from a Miniti meeting. Returns the
 * parsed extraction payload + cost/usage. Stored on
 * ExternalEvent.orchestratorExtraction by the caller.
 */
export async function runMinitiExtraction({ context }) {
  const startedAt = Date.now();
  const today = new Date(context.today || new Date().toISOString().slice(0, 10));
  const systemPrompt = EXTRACTION_PROMPT.replace("{{TODAY}}", today.toISOString().slice(0, 10));

  const approxTokens = Math.ceil(JSON.stringify(context).length / 4);
  console.log(
    `[miniti] extraction (pass 1): input ~${approxTokens} prompt tokens, ` +
      `${context.openTasks?.length ?? 0} open tasks`
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(context) }],
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("Pass 1 returned no text block");
  }
  let extraction;
  try {
    extraction = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`Pass 1 JSON parse failed: ${err.message}`);
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[miniti] extraction (pass 1): ${extraction.actionItems?.length ?? 0} action items, ` +
      `${extraction.reportedCompletions?.length ?? 0} completions, ` +
      `tone=${extraction.meetingTone}, ${durationMs}ms`
  );

  await logAICall({
    kind: "miniti_extraction",
    scopeId: String(context.meeting?.id ?? ""),
    model: response.model,
    inputTokens: response.usage.input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    costUsd: computeCost(response.model, response.usage),
    durationMs,
    requestId: response.id,
  }).catch((err) => console.warn("[orchestrator] extraction logAICall failed", err));

  return {
    extraction,
    usage: response.usage,
    model: response.model,
    requestId: response.id,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Pass 2 — Decision (tool-use)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Vector. You take pre-extracted facts from a B2B onboarding meeting (Pass 1) and decide what to do with them — match to existing tasks, create new ones, mark completions, or flag none. Another reviewer will approve every tool call before anything writes to the database.

You will receive a JSON context with:
- meeting.title, meeting.date, meeting.summary, meeting.transcript (you can re-read if needed)
- extraction: Pass 1's structured findings:
    - actionItems[]: { claim, sourceQuote, speaker, mentionedOwner, mentionedDueDate, mentionedDependency, firmness, notesSnippet }
    - reportedCompletions[]: { claim, sourceQuote, speaker }
    - externalBlockers[]: string[]
    - meetingTone: short label
- openTasks: existing OPEN tasks for this onboarding, each with id, title, status, phaseId, due, assigneeContactId, description, notes, blockedByTaskId
- customerContacts: [{ id, name, email }] — for assigneeContactId
- vendorUsers: [{ id, name, email }] — Caroline's team; for ownerId
- phases: [{ id, name, isComplete }]
- today: today's ISO date

For each extraction.actionItems entry, decide:
- If it maps to an existing open task by topic, call match_to_existing_task_draft (don't duplicate).
- If it's a new firm commitment, call create_task_draft.
- If it's a "vague" item with no clear owner or commitment, skip it.

For each extraction.reportedCompletions entry, call update_task_status_draft against the matching task (newStatus = "Done").

If extraction.actionItems is empty AND reportedCompletions is empty (or all items are too vague to action), call flag_no_action_items.

Rules, non-negotiable:

1. RESOLVE the verbatim mentions to ids:
   - mentionedOwner: match against vendorUsers (by name) → ownerId. If the speaker is a customer-side person, match against customerContacts → assigneeContactId. If neither matches confidently, leave the relevant id null.
   - mentionedDueDate: convert to ISO YYYY-MM-DD relative to today (e.g. "by Friday" → next Friday's date). If genuinely ambiguous, leave dueDate empty.
   - mentionedDependency: match against openTasks (use task title + description + notes for the match) → blockedByTaskId. If the dependency is external (mentioned in extraction.externalBlockers or describes a non-task blocker), leave blockedByTaskId null and put the blocker in notes.

2. NEVER guess. If you can't resolve a mention with reasonable confidence, leave the field null/omitted. The vendor reviews every draft.

3. Match before you create. If extraction.claim plausibly maps to an existing open task (compare title + description + notes), use match_to_existing_task_draft. Don't duplicate work.

4. phaseId is REQUIRED on create_task_draft and MUST be from the phases array. Pick the phase that semantically fits (Discovery / Setup / Migration / Go-Live etc.). If unclear, pick the first non-complete phase.

5. Every tool call MUST include sourceQuote. Use the same sourceQuote that Pass 1 surfaced — don't invent a new one.

6. Never invent task ids, contact ids, vendor user ids, or phase ids. Use only ids that appear in the context.

7. Confidence on the tool call:
   - high   = mentioned owner explicitly named + clear deadline + firm extraction
   - medium = clear commitment, one of (owner, deadline) inferred or vague
   - low    = implied or ambiguous; flag for the vendor to verify

8. Skip "vague" items unless extraction.actionItems.firmness == "firm" or "tentative" with a credible owner — vague items rarely produce useful tasks.

9. Notes: if an action item has notesSnippet, copy it verbatim into the create_task_draft notes field. Add any external blockers from extraction.externalBlockers if relevant.

${GLOBAL_RULES}

Today is {{TODAY}}.`;

const TOOLS = [
  {
    name: "create_task_draft",
    description: "Propose creating a new task. Use when an action item is a fresh commitment not covered by any existing open task. Fill in as many fields as the extraction supports; leave the rest null/omitted.",
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
          description: "Verbatim transcript snippet from extraction.notesSnippet plus any external blockers. Max ~200 chars.",
        },
        sourceQuote: {
          type: "string",
          description: "REQUIRED. Verbatim — use extraction.sourceQuote.",
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
 * Pass 2: take Pass 1's extraction + onboarding context and emit tool
 * calls. Returns normalised tool calls + cost/usage.
 *
 *   { calls: [{ tool, input, id }], usage, model, requestId, durationMs }
 *
 * `extraction` is the Pass 1 output. If you call this without first
 * running Pass 1, pass `extraction: null` and the prompt will fall back
 * on the transcript directly — but observability suffers.
 */
export async function runMinitiOrchestrator({ context, extraction = null, kind = "miniti_orchestrator" }) {
  const startedAt = Date.now();
  const today = new Date(context.today || new Date().toISOString().slice(0, 10));
  const systemPrompt = SYSTEM_PROMPT.replace("{{TODAY}}", today.toISOString().slice(0, 10));

  const userPayload = { ...context, extraction };
  const approxTokens = Math.ceil(JSON.stringify(userPayload).length / 4);
  console.log(
    `[miniti] orchestrator (pass 2): input ~${approxTokens} prompt tokens, ` +
      `${context.openTasks?.length ?? 0} open tasks, ` +
      `${extraction?.actionItems?.length ?? 0} extracted items`
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    tools: TOOLS,
  });

  const calls = response.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ tool: b.name, input: b.input, id: b.id }));

  console.log(
    `[miniti] orchestrator (pass 2): ${response.content.length} content blocks, ` +
      `${calls.length} tool calls`
  );

  const durationMs = Date.now() - startedAt;

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
