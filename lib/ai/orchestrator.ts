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
 * Both prompts carry Caroline's judgement rules from the 2026-10-11
 * golden-set review (evals/golden/README.md, "Judgement rules"): parked
 * items with an owner become undated tasks, vague or anchored dates are
 * inferred from the meeting date (reasoning goes in notes), "right after
 * this call" promises are tasks, notes carry the agreed specifics, blockers
 * (board tasks or plain text for non-task blockers) go in dependsOn, an overwhelmed
 * customer gets nothing new (our owner gets a circle-back reminder), and
 * existing tasks are cross-checked against what was agreed. Pass 1 decides
 * which of these surface as action items; Pass 2 decides the drafts. The
 * rules are phrased generally on purpose: the golden set is the test, so
 * the prompts must not contain its answers.
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

import type { TextBlock, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OrchestratorContext } from "@/lib/integrations/miniti";
import { anthropic, computeCost } from "@/lib/ai/client";
import { logAICall } from "@/lib/db";
import { GLOBAL_RULES } from "@/lib/ai/global-rules";

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One Pass 1 action item. Fields mirror EXTRACTION_SCHEMA. */
export type ExtractionActionItem = {
  claim: string;
  sourceQuote: string;
  speaker?: string;
  mentionedOwner?: string;
  mentionedDueDate?: string;
  mentionedDependency?: string;
  firmness: "firm" | "tentative" | "vague";
  notesSnippet?: string;
};

/** Pass 1 output (parsed model JSON). Stored on ExternalEvent.orchestratorExtraction. */
export type MinitiExtraction = {
  actionItems?: ExtractionActionItem[];
  reportedCompletions?: { claim: string; sourceQuote: string; speaker?: string }[];
  externalBlockers?: string[];
  meetingTone?: string;
};

/** Arguments of any Pass 2 tool call. Model output, so every field is
 *  optional; the index signature keeps it a valid JSON payload. */
export type OrchestratorToolInput = {
  title?: string;
  description?: string;
  ownerId?: number | null;
  assigneeContactId?: number | null;
  dueDate?: string;
  phaseId?: number | null;
  priority?: string;
  blockedByTaskId?: number | null;
  dependsOn?: Prisma.JsonValue;
  notes?: string;
  sourceQuote?: string;
  confidence?: string;
  taskId?: number | null;
  action?: string;
  newStatus?: string;
  reason?: string;
  [key: string]: Prisma.JsonValue | undefined;
};

/** A normalised Pass 2 tool call. */
export type OrchestratorToolCall = {
  tool: string;
  input: OrchestratorToolInput;
  id: string;
};

/** PendingAIChange.action values the orchestrator emits, plus the "no_action" sentinel. */
export type OrchestratorAction = "create_task" | "match_existing" | "update_status" | "no_action";

// ---------------------------------------------------------------------------
// Pass 1 — Extraction
// ---------------------------------------------------------------------------

/**
 * "2026-06-18 (Thursday)": the ISO date plus its weekday, for the prompts'
 * {{TODAY}}. Date inference ("by Tuesday", "early next week") is weekday
 * arithmetic, and the model gets it wrong more often when it has to work
 * the weekday out from a bare ISO date. UTC, because `today` is parsed
 * from an ISO date string (midnight UTC). The JSON context keeps the bare
 * ISO date.
 */
export function promptDate(d: Date): string {
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `${d.toISOString().slice(0, 10)} (${weekday})`;
}

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
  - sourceQuote: ONE continuous passage copied word for word from a single speaker's turn in the transcript. Never join separate turns or speakers, never paraphrase, and never quote the meeting's summary, notes or key decisions. Only if the commitment appears nowhere in the transcript, use the exact wording of the matching meeting.actionItems entry instead.
  - speaker: who said it (use the name from the transcript verbatim, e.g. "Ian Ahuja", "Marco", "unknown" if not attributable).
  - mentionedOwner: the name of the person who said they'd do it, VERBATIM from the transcript ("Marco", "Ian", "the customer's IT team", or "" if not mentioned). DO NOT resolve to an id.
  - mentionedDueDate: VERBATIM date phrasing ("by Friday", "next week", "end of Q3") or "" if no deadline mentioned. DO NOT convert to ISO.
  - mentionedDependency: VERBATIM phrasing of any blocker mentioned ("blocked on the SSO setup", "waiting for legal sign-off") or "" if no dependency mentioned. This includes things that are not tasks (a sign-off, another team, an approval) and other action items from this same meeting ("once the export is done"). DO NOT match to a task id.
  - firmness: "firm" (clear commitment with timing or owner), "tentative" (commitment but vague timing/owner, including a parked item that someone has taken on; see below), "vague" (someone mused about it but didn't commit and nobody took it on).
  - notesSnippet: ~200 char verbatim transcript window around the commitment so the next pass has surrounding context. When the specifics that were agreed (scope, names of the things involved, audience, constraints, who to send it to) sit near the commitment, pick the window that contains them.

reportedCompletions[]: every claim that an existing piece of work is now done. ("Data migration is complete", "we've signed the DPA"). Each item has:
  - claim, sourceQuote, speaker.

externalBlockers[]: external blockers mentioned that aren't tasks ("customer's IT team is non-responsive", "legal review delays"). Just short strings.

meetingTone: a single short label — one of "kickoff", "status update", "casual catchup", "escalation", "planning", "review", "other".

Rules:
1. Be FAITHFUL. Every actionItem must point to a sourceQuote that is literally present, character for character, in one transcript turn (or, failing that, one meeting.actionItems entry). If you can't quote it that way, don't surface it.
2. Capture EVERYTHING. Err on the side of including marginal items — Pass 2 decides whether they make it through.
3. Keep mentioned-* fields as VERBATIM TEXT. Do NOT resolve names to ids, do NOT convert dates to ISO. That's Pass 2's job.
4. If meeting.actionItems already lists an item that you find in the transcript too, surface it once with the most informative sourceQuote.
5. If the meeting has zero commitments of any kind (no firm ones, no parked items someone took on, no promised check-ins; e.g. a casual catch-up), return actionItems: [] and let meetingTone tell the story.

What counts as an action item (judgement rules; these refine rule 2, they do not loosen rule 1):
A. Promises to do something "right after this call", "straight after we hang up", "later today" are action items like any other. People get distracted after calls. Mark them firm, with the timing phrase as mentionedDueDate.
B. Parked items ARE action items. The test is: is it a SPECIFIC piece of work (you could write it as a task title) that one side said they will want, need or do later ("later on we'll need...", "one day we'll have to...", "not today, but...", "let's park that", "phase two")? If yes, capture it as "tentative" with mentionedDueDate = "" unless a time was given. mentionedOwner = the person who should carry it forward: whoever said they'd note or track it; otherwise whoever raised the need; if the vendor side acknowledged it ("I'll keep that on my list", "we'll come back to it"), that vendor person.
   Example (different domain): "Later on we'll need the delivery report split by region, not this quarter though." "I'll keep that on my list." → tentative item "Delivery report split by region", owner = the person keeping it on their list.
   NOT action items: vague musing with no concrete deliverable ("it'd be great to be more data-driven someday"), hypotheticals, opinions, descriptions of how things work today, and ideas that were raised and then explicitly rejected ("actually, let's not").
C. When the customer says they are overwhelmed, stretched, or asks for space or time before taking on more, do NOT surface new work for the customer from that exchange. If the vendor side agrees to check back in (or it is clearly the vendor's job to pick it up again later), surface that as one vendor-owned action item ("Check back in with <contact> about <topic>"), with any timing that was discussed as mentionedDueDate.
D. Updates to work that already exists count too: if someone restates, re-times, or hands over a piece of work that looks like it is already on openTasks, surface it as an action item with the new owner or timing as said, so the next pass can compare it against the board.

${GLOBAL_RULES}

Today is {{TODAY}}. This is normally the meeting date; if meeting.date differs, dates said in the meeting are relative to meeting.date.`;

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
export async function runMinitiExtraction({ context }: { context: OrchestratorContext }) {
  const startedAt = Date.now();
  const today = new Date(context.today || new Date().toISOString().slice(0, 10));
  const systemPrompt = EXTRACTION_PROMPT.replace("{{TODAY}}", promptDate(today));

  const approxTokens = Math.ceil(JSON.stringify(context).length / 4);
  console.log(
    `[miniti] extraction (pass 1): input ~${approxTokens} prompt tokens, ` +
      `${context.openTasks?.length ?? 0} open tasks`
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Low temperature so the same transcript yields the same extraction
    // across runs. We still need >0 so Claude can phrase claim/notesSnippet
    // naturally rather than echoing the prompt format too rigidly.
    temperature: 0.2,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(context) }],
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
  });

  const textBlock = response.content.find((b): b is TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Pass 1 returned no text block");
  }
  let extraction: MinitiExtraction;
  try {
    extraction = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`Pass 1 JSON parse failed: ${(err as Error).message}`);
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
- openTasks: existing OPEN tasks for this onboarding, each with id, taskId (human-readable e.g. "AC-12"), title, status, phaseId, due, ownerId (a vendorUsers id), priority, assigneeContactId (a customerContacts id), description, notes, dependsOn (what it already waits on: [{ taskId } | { text }], taskId being another openTasks id). When referring to a task in sourceQuote or notes, you may use its taskId (e.g. "blocked on AC-7") for readability.
- customerContacts: [{ id, name, email }] — for assigneeContactId
- vendorUsers: [{ id, name, email }] — Caroline's team; for ownerId
- phases: [{ id, name, isComplete }]
- today: today's ISO date

For each extraction.actionItems entry, decide:
- If it maps to an existing open task by topic, call match_to_existing_task_draft (don't duplicate). Every change to that task goes in the one draft's \`changes\` object.
- Otherwise call create_task_draft. This includes commitments where the actor is vendor-side (Caroline's team) — internal vendor work IS roadmap work and belongs as a draft on this onboarding too. Don't filter by who owns it.
- If it's a "vague" item with no clear owner AND no clear commitment, skip it. Tentative items with a credible owner still get a create_task_draft (mark confidence "low"). Parked items that someone owns remembering are tentative items with an owner: draft them undated (see JUDGEMENT RULES).

For each extraction.reportedCompletions entry, call update_task_status_draft against the matching task (newStatus = "Done").

flag_no_action_items is the LAST RESORT. Call it only when extraction.actionItems is literally empty AND extraction.reportedCompletions is literally empty. If Pass 1 surfaced even one firm or tentative actionItem, you must emit a draft for it — never substitute flag_no_action_items as a "this isn't relevant enough" judgment call. The vendor reviews every draft and will dismiss what isn't useful.

Rules, non-negotiable:

1. RESOLVE the verbatim mentions to ids:
   - mentionedOwner: match against vendorUsers (by name) → ownerId. If the speaker is a customer-side person, match against customerContacts → assigneeContactId. If neither matches confidently, leave the relevant id null.
   - mentionedDueDate: convert to ISO YYYY-MM-DD relative to the meeting date (today, unless meeting.date says otherwise; e.g. "by Friday" → next Friday's date). Vague and anchored phrases count as dates too; see JUDGEMENT RULES (dates). Only leave dueDate empty when no timing was said at all, or the phrase has no reasonable reading.
   - mentionedDependency: match against openTasks (use task title + description + notes for the match) → dependsOn [{ taskId: <openTasks id> }]. If the dependency is not a task on the board (mentioned in extraction.externalBlockers or describes a non-task blocker) or is another new item from this same meeting → dependsOn [{ text: "<the blocker in a few words>" }]. See JUDGEMENT RULES E.

2. NEVER guess. If you can't resolve a mention with reasonable confidence, leave the field null/omitted. The vendor reviews every draft.

3. Match before you create. If extraction.claim plausibly maps to an existing open task (compare title + description + notes), use match_to_existing_task_draft. Don't duplicate work. Several action items about the same existing task become ONE match_to_existing_task_draft with all their changes (see JUDGEMENT RULES G and H).

4. phaseId is REQUIRED on create_task_draft and MUST be from the phases array. Pick the phase that semantically fits (Discovery / Setup / Migration / Go-Live etc.). If unclear, pick the first non-complete phase.

5. Every tool call MUST include sourceQuote. Use the same sourceQuote that Pass 1 surfaced — don't invent a new one. When several action items merge into one draft (e.g. one update carrying several changes to the same task), use the quote of the most important change; never join quotes together.

6. Never invent task ids, contact ids, vendor user ids, or phase ids. Use only ids that appear in the context.

7. Confidence on the tool call:
   - high   = mentioned owner explicitly named + clear deadline + firm extraction
   - medium = clear commitment, one of (owner, deadline) inferred or vague
   - low    = implied or ambiguous; flag for the vendor to verify

8. Firm items always produce a draft. Tentative items with any credible owner (vendor or customer) produce a draft (confidence: low). Only skip pure "vague" items with no owner and no commitment.

9. Notes: write the create_task_draft notes in your own words, concisely, from notesSnippet and the transcript. They hold the crucial specifics agreed on the call (see JUDGEMENT RULES), then any "Due date: ..." reasoning. Do not paste a raw transcript window. Blockers do not go in notes; they go in dependsOn (rule E), including relevant ones from extraction.externalBlockers.

JUDGEMENT RULES (how an experienced onboarding manager listens; apply them when deciding and filling drafts):

A. Parked items become undated tasks. When extraction surfaced a parked item (a specific piece of work one side said they'll want, need or do later), create a task with NO dueDate (unless a time was actually given), owned by the person extraction named: the vendor user via ownerId, or the customer contact via assigneeContactId. Priority "low", confidence "low" or "medium". Title it as the deliverable itself, and say in notes that it was parked and why ("Parked: not in scope until after launch").
   Do NOT create a task for: vague musing with no concrete deliverable, hypotheticals, opinions, descriptions of how things work today, ideas explicitly rejected, or general goodwill ("we should catch up sometime"). The line is concreteness: a nameable deliverable someone wants later is a task; a general wish is not.

B. Dates. Turn vague and anchored timing into a concrete date, counting from the meeting date and its weekday (given below):
   - "by <weekday>" / "on <weekday>" = the next occurrence of that weekday after the meeting.
   - "early next week" = the Tuesday of next week; "end of next week" = the Friday of next week; "end of the week" = this week's Friday; "tomorrow" = the next day; "mid-<month>" = the 15th; "end of the month" = the last day of the month.
   - "right after this call", "today", "later today" = the meeting date itself.
   - Anchored to another event ("before the review on <date>", "ahead of the launch on <date>") = the working day before that event. "By" or "at" an event = the event's date.
   - Explicit dates win over inference.
   Whenever you inferred a date rather than read it directly, add one short line to notes: "Due date: <phrase> from <meeting weekday + date> = <result>." Example: "Due date: 'ahead of the stocktake on Wed 9 Apr' = Tue 8 Apr."

C. "Right after this call" promises are tasks like any other. Draft them with the meeting date as dueDate. Do not skip them because they sound immediate or trivial.

D. Notes carry the specifics. Copy into notes the crucial details agreed on the call: scope (what is in and what is out), names of the specific things involved, the audience, constraints, and who to send it to. Short, in your own words, a few comma-separated phrases or one or two sentences, never a raw transcript dump. Prefer the exact names people used for the things involved, so a reader can search for them. If nothing specific was agreed, keep notes short.

E. Dependencies. When the item can only happen after something else, list every blocker in dependsOn (a task can wait on several things):
   - the blocker is an existing open task → { "taskId": <its openTasks id> }.
   - the blocker is not a task on the board (a sign-off, an approval, another team, an external event) → { "text": "<the blocker, short, in the words used on the call>" }, e.g. { "text": "legal sign-off on the contract" }.
   - the blocker is another new task you are proposing from this same meeting → { "text": "<that new task's title>" }.
   This applies to new tasks (create_task_draft.dependsOn) and to existing ones: when the call says an existing open task now waits on something its dependsOn does not already list, put it in match_to_existing_task_draft changes.dependsOn. Do not repeat a blocker the task already has. Do not write "Blocked by" lines in notes.

F. Overwhelmed customer. When the customer says they are overwhelmed, stretched thin, or asks for space before taking on more, put NOTHING new on their plate from that exchange: no customer-owned tasks, no assigneeContactId for them on new work. Instead create one reminder for our own owner (ownerId = the vendor user who owns the relationship or took it on) to circle back, titled like "Check back in with <contact> about <topic>", with dueDate set to the check-in time if one was discussed (rule B), otherwise empty. Put the reason in notes ("Customer asked for space until ...").

G. Cross-check existing tasks. When the call touches an existing open task (it maps via match_to_existing_task_draft, or someone talks about that work), compare its owner, assignee, due date and priority against what was agreed on the call. Propose ONE match_to_existing_task_draft per existing task, carrying every change in its \`changes\` object: ownerId / assigneeContactId when the work changed hands, dueDate when the timing moved (rule B applies; null when the call says the date no longer applies), priority when it was re-ranked. Do not split one task's changes across several drafts. Only include a field when the call disagrees with the board; do not restate what the board already says.

H. Add what was agreed to existing tasks. When the call adds information to an existing task (scope, names of the specific things involved, audience, constraints, who to send it to), put it in changes.appendNotes, following rule D. A new blocker goes in changes.dependsOn (rule E), not in notes. It is appended to the task's notes as a new dated line, never replacing what is there, so write only what is new, not a restatement of the existing notes. Add any "Due date: ..." reasoning line (rule B) there too. A call that adds information but changes nothing else is still worth one update with appendNotes only.

${GLOBAL_RULES}

Today is {{TODAY}}. This is normally the meeting date; if meeting.date differs, count dates from meeting.date.`;

/** `dependsOn` on both draft tools: board tasks or plain-text blockers. */
const DEPENDS_ON_SCHEMA = {
  type: "array",
  description: "What this task waits on (see JUDGEMENT RULES E). Each item is EITHER { taskId } for an open task on the board OR { text } for anything else: a blocker that is not a task (a sign-off, another team, an external event), or another new task proposed from this same meeting (use its title). Omit when nothing blocks it.",
  items: {
    type: "object",
    properties: {
      taskId: { type: "integer", description: "An id from openTasks." },
      text: { type: "string", description: "The blocker in a few words." },
    },
    additionalProperties: false,
  },
};

const TOOLS: Tool[] = [
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
        dependsOn: DEPENDS_ON_SCHEMA,
        notes: {
          type: "string",
          description: "Concise, in your own words: the crucial specifics agreed on the call (scope, names, audience, constraints, recipient), then any \"Due date: ...\" line explaining an inferred date. Blockers go in dependsOn, not here. Not a raw transcript dump.",
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
    description: "Propose updating an existing open task instead of creating a duplicate. Use when an action item maps to a task already in the openTasks list. One draft per task: put EVERY change agreed on the call for that task in `changes` (new owner or assignee, new due date, new priority, notes to append, new blockers). Only include fields that differ from the board.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "integer", description: "Must be an id from openTasks" },
        changes: {
          type: "object",
          description: "The changes to apply to the task, all at once. At least one field.",
          properties: {
            ownerId: {
              type: "integer",
              description: "New vendor owner. MUST be an id from vendorUsers. Only when the work moved to a different vendor team-mate.",
            },
            assigneeContactId: {
              type: "integer",
              description: "New customer-side assignee. MUST be an id from customerContacts. Only when the work moved to a different customer contact.",
            },
            priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority." },
            dueDate: {
              type: ["string", "null"],
              description: "New due date, ISO YYYY-MM-DD (see JUDGEMENT RULES, dates). null removes the task's due date: only when the call says there is no date for it any more.",
            },
            appendNotes: {
              type: "string",
              description: "Concise, in your own words: what the call added to this task (scope, names, audience, constraints, recipient), then any \"Due date: ...\" line explaining an inferred date. Appended to the task's notes as a new dated line; never repeat what the notes already say. Blockers go in dependsOn.",
            },
            dependsOn: {
              ...DEPENDS_ON_SCHEMA,
              description: "Blockers to ADD to this task (see JUDGEMENT RULES E). Only ones its dependsOn does not already list.",
            },
          },
          minProperties: 1,
          additionalProperties: false,
        },
        sourceQuote: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["taskId", "changes", "sourceQuote", "confidence"],
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
export async function runMinitiOrchestrator({
  context,
  extraction = null,
  kind = "miniti_orchestrator",
}: {
  context: OrchestratorContext;
  extraction?: MinitiExtraction | null;
  kind?: string;
}) {
  const startedAt = Date.now();
  const today = new Date(context.today || new Date().toISOString().slice(0, 10));
  const systemPrompt = SYSTEM_PROMPT.replace("{{TODAY}}", promptDate(today));

  const userPayload = { ...context, extraction };
  const approxTokens = Math.ceil(JSON.stringify(userPayload).length / 4);
  console.log(
    `[miniti] orchestrator (pass 2): input ~${approxTokens} prompt tokens, ` +
      `${context.openTasks?.length ?? 0} open tasks, ` +
      `${extraction?.actionItems?.length ?? 0} extracted items`
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    // A busy meeting proposes many drafts, each with a description, notes and
    // source quote. 2000 was hit in practice and cut the last draft short, so
    // leave plenty of headroom; the warning below flags it if it happens again.
    max_tokens: 8000,
    // Same Pass 1 → same draft set, run after run. The decision logic
    // is rule-based enough that we want repeatable tool calls, not creative
    // re-interpretation each time.
    temperature: 0.2,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    tools: TOOLS,
  });

  const calls: OrchestratorToolCall[] = response.content
    .filter((b): b is ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ tool: b.name, input: b.input as OrchestratorToolInput, id: b.id }));

  console.log(
    `[miniti] orchestrator (pass 2): ${response.content.length} content blocks, ` +
      `${calls.length} tool calls`
  );
  if (response.stop_reason === "max_tokens") {
    console.warn(
      `[miniti] orchestrator (pass 2): hit max_tokens; the last draft may be incomplete`
    );
  }

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
export function toolCallToAction(toolName: string): OrchestratorAction {
  switch (toolName) {
    case "create_task_draft": return "create_task";
    case "match_to_existing_task_draft": return "match_existing";
    case "update_task_status_draft": return "update_status";
    case "flag_no_action_items": return "no_action";
    default: throw new Error(`unknown tool ${toolName}`);
  }
}
