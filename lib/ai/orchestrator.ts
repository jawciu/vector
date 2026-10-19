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
 * (board tasks, other new drafts from the same meeting by draftRef, or plain
 * text for non-task blockers) go in dependsOn, an overwhelmed
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
 * Pass 2 emits one complete batch, unpacked into individual draft calls.
 * Each contained call becomes one PendingAIChange row.
 *
 * Used by:
 *   - app/api/integrations/miniti/webhook/route.js (after the 200 ack)
 *   - future Linear/Attio webhooks (same shape, smaller context payload)
 */

import type { TextBlock, Tool } from "@anthropic-ai/sdk/resources/messages";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OrchestratorContext } from "@/lib/integrations/miniti";
import { anthropic, computeCost } from "@/lib/ai/client";
import { logAICall } from "@/lib/db";
import { GLOBAL_RULES } from "@/lib/ai/global-rules";
import { buildMeetingCalendar, buildRelativeDateHints, normaliseRelativeDraftDates } from "@/lib/ai/meeting-calendar";
import { excludeMeetingAdministration } from "@/lib/ai/draft-eligibility";
import { normaliseRecorderOwnership } from "@/lib/ai/draft-ownership";
import { normaliseDraftQuotes } from "@/lib/ai/draft-evidence";

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One Pass 1 action item. Fields mirror EXTRACTION_SCHEMA. */
export type ExtractionActionItem = {
  /** Explicit activity classification, independent of whether the promise was firm. */
  category?: "onboarding_work" | "meeting_administration";
  claim: string;
  sourceQuote: string;
  speaker?: string;
  mentionedOwner?: string;
  mentionedDueDate?: string;
  mentionedDependency?: string;
  firmness: "firm" | "tentative" | "vague";
  notesSnippet?: string;
  /** Verbatim execution details, including facts stated outside the commitment turn. */
  details?: string[];
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
  /** create_task_draft: short id ("d1") other drafts' dependsOn can name. */
  draftRef?: string;
  /** create_task_draft: the recorder ("You") made this commitment but nobody
   *  has said who records meetings, so the owner is left empty. */
  ownerFromRecorder?: boolean;
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
- meeting.transcript: the FULL meeting transcript, one turn per line as "<speaker>: <words>". The label before the first colon says who is talking; it is not part of what they said, so never copy it into a quote.
- meeting.actionItems: Miniti's pre-extracted action items (strings)
- openTasks, customerContacts, vendorUsers, phases (for reference only — DO NOT resolve to ids in this pass)
- recorder: { id, name } of the person who recorded the meeting, or null when nobody has said who that is (see the rule on the recorder below)
- today: today's ISO date

The recorder: the transcript labels whoever recorded the meeting as "You" (Miniti's own microphone, never a customer). They are on the vendor side, one of our own team. Treat "You" like any other named speaker: what they promise is an action item, with speaker "You" and mentionedOwner "You" when they said they'd do it.

Produce a single JSON object with these arrays:

actionItems[]: every concrete commitment surfaced anywhere in the transcript or in meeting.actionItems. For each one capture:
  - category: "meeting_administration" for routine meeting recaps, calendar housekeeping and conversational sign-offs; otherwise "onboarding_work". This is independent of firmness: a firm promise to recap a meeting is still administration. Delivering a substantive agreed work artifact is onboarding_work, even immediately after the call.
  - claim: a short imperative summary of what was committed to ("Send security questionnaire").
  - sourceQuote: ONE continuous passage copied word for word from a single speaker's turn in the transcript. Never join separate turns or speakers, never paraphrase, and never quote the meeting's summary, notes or key decisions. Only if the commitment appears nowhere in the transcript, use the exact wording of the matching meeting.actionItems entry instead.
  - speaker: who said it (use the name from the transcript verbatim, e.g. "Ian Ahuja", "Marco", "unknown" if not attributable).
  - mentionedOwner: the name of the person who said they'd do it, VERBATIM from the transcript ("Marco", "Ian", "the customer's IT team", or "" if not mentioned). DO NOT resolve to an id.
  - mentionedDueDate: VERBATIM date phrasing ("by Friday", "next week", "end of Q3") or "" if no deadline mentioned. DO NOT convert to ISO.
  - mentionedDependency: VERBATIM phrasing of any blocker mentioned ("blocked on the SSO setup", "waiting for legal sign-off") or "" if no dependency mentioned. This includes things that are not tasks (a sign-off, another team, an approval) and other action items from this same meeting ("once the export is done"). DO NOT match to a task id.
  - firmness: "firm" (clear commitment with timing or owner), "tentative" (commitment but vague timing/owner, including a parked item that someone has taken on; see below), "vague" (someone mused about it but didn't commit and nobody took it on).
  - notesSnippet: ~200 char verbatim transcript window around the commitment so the next pass has surrounding context. When the specifics that were agreed (scope, names of the things involved, audience, constraints, who to send it to) sit near the commitment, pick the window that contains them.
  - details: short VERBATIM facts needed to carry out or verify this work: named files/metrics, comparison/reference systems, scope, audience, constraints and delivery instructions. Gather relevant facts from other turns too; the ~200 char notesSnippet is not a limit on these details. Preserve exclusions and negations. Use [] if no execution details were agreed. Progress percentages alone are not execution instructions.

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
B. Separate immediate delivery, recording a concrete request for later, and speculation:
   - A specific future output that the meeting agrees to retain is PARKED WORK. "Noted for later", "noted as a nice-to-have" and "I'll note it for the roadmap" record the request. Extract it as tentative and undated. "Not committing now", "not urgent", "not in this phase" or "nothing to do now" deny current delivery, not remembering the agreed future output. Do not discard the request because it is deferred.
   - Ownership follows the future output, not the acknowledgement. Customer-owned reports/models stay with the customer requester even when a vendor says "noted"; that is not a handover. Vendor-product changes stay vendor-owned. A teammate explicitly saying "I'll note/track it for the roadmap" takes on remembering that request. Title the parked item as the future output itself, not "Track request" or "Note wish". Do not invent a delivery deadline or promise to ship it.
   - A vague possible future product/opportunity, without a specific requested output accepted for tracking, is speculation. "A future module might need analytics" stays out. "We will need this report split by region", acknowledged for later, stays in as one parked task.
   - Cheap optional checks supporting an already committed deliverable are instructions on that task, not independently parked work. "If easy, include before/after timings with the migration" goes in the migration's details. Only an independent promise to deliver/track those measurements separately makes a separate action.
C. When the customer says they are overwhelmed, stretched, or asks for space or time before taking on more, do NOT surface new work for the customer from that exchange. If the vendor side agrees to check back in (or it is clearly the vendor's job to pick it up again later), surface that as one vendor-owned action item ("Check back in with <contact> about <topic>"), with any timing that was discussed as mentionedDueDate.
D. Updates to work that already exists count too: if someone restates, re-times, or hands over a piece of work that looks like it is already on openTasks, surface it as an action item with the new owner or timing as said, so the next pass can compare it against the board.
E. Keep separate commitments even when one starts only after another. "Once X is ready, I will do Y" includes Y as its own action, with X in mentionedDependency. A dependency does not swallow the downstream deliverable.
   If somebody is also responsible for obtaining/providing X, extract that work separately as well. An owned approval/sign-off action is still work; only an external condition with no committed action stays solely a blocker.
   A concrete request for the speaker's own team to review an artifact before proceeding is such work, even when phrased as "I'd like our team to review it" rather than "I'll obtain approval". Capture the requested review, with that speaker coordinating it, and the required artifacts as dependencies. Do not reduce this to a blocker label on the artifact-producing task.
F. Read every turn for commitments, including short replies and collective plans, not just sentences beginning "I will". Resolve "it", "that" and "both" from nearby turns in the claim, while keeping sourceQuote verbatim. "I'll pass it on" is separate recipient-owned hand-off work, not just a note on the sender's delivery. "Once the inputs arrive, we load the archive" commits to the later load even if no one repeats it in the closing recap. If a reply both requests information and promises a response after receiving it, capture each side's actual commitment with its own speaker and owner. Do not assign the response to whoever supplies the information. For a turn like "Tell us when you choose and we will revise the estimate", extract the speaker's promised revision separately from the other person's notification. Keep both actors distinct even if they refer to the same future input. The vendor response is a follow-up/check-back commitment, not merely a description of the eventual event. Capture it even when a larger task already names that event.
   For every extracted action, scan the preceding AND following turns for explicit prerequisite evidence. Carry all agreed inputs in mentionedDependency even when another speaker states them or their delivery is promised later in the call. "You'll need the export to run this" and a later offer to send the export establish the same relation as "waiting for the export". Preserve the exact evidence wording; do not invent prerequisites from ordinary workflow assumptions. A later clarification that work can proceed in parallel overrides a suspected dependency.
G. A cheap optional measurement supporting another deliverable is execution detail of that deliverable, not an independent commitment. Carry it in that action's details with its qualification. Extract separate measurement work only if someone commits to delivering or tracking it independently.
H. Routine recaps and scheduling of this check-in itself, sign-offs and invitations to ask for help do not become onboarding work by themselves. Coordinating an actual onboarding deliverable or promising a response to a pending customer decision is onboarding_work, not meeting administration. Preserve substantive deliverables promised immediately after a call, such as sending an agreed artifact. Do not turn conversational closing remarks into a follow-up task.

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
          category: { type: "string", enum: ["onboarding_work", "meeting_administration"] },
          sourceQuote: { type: "string" },
          speaker: { type: "string" },
          mentionedOwner: { type: "string" },
          mentionedDueDate: { type: "string" },
          mentionedDependency: { type: "string" },
          firmness: { type: "string", enum: ["firm", "tentative", "vague"] },
          notesSnippet: { type: "string" },
          details: { type: "array", items: { type: "string" } },
        },
        required: ["claim", "sourceQuote", "firmness", "details", "category"],
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
    max_tokens: 6000,
    temperature: 0.2,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(context) }],
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
  });

  const durationMs = Date.now() - startedAt;
  await logAICall({
    kind: "miniti_extraction", scopeId: String(context.meeting?.id ?? ""), model: response.model,
    inputTokens: response.usage.input_tokens ?? 0, cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0, outputTokens: response.usage.output_tokens ?? 0,
    costUsd: computeCost(response.model, response.usage), durationMs, requestId: response.id,
  }).catch((err) => console.warn("[orchestrator] extraction logAICall failed", err));
  if (response.stop_reason === "max_tokens") throw new Error("Pass 1 extraction exceeded max_tokens");
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

  console.log(
    `[miniti] extraction (pass 1): ${extraction.actionItems?.length ?? 0} action items, ` +
      `${extraction.reportedCompletions?.length ?? 0} completions, ` +
      `tone=${extraction.meetingTone}, ${durationMs}ms`
  );

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

const SYSTEM_PROMPT = `You are Vector. Propose reviewable onboarding task drafts from a meeting. Nothing is executed until a human approves.

INPUT
meeting contains the speaker-labelled transcript and Miniti actionItems. extraction contains verbatim facts: actionItems (claim, sourceQuote, speaker, mentionedOwner, mentionedDueDate, mentionedDependency, firmness, notesSnippet, details), reportedCompletions, externalBlockers. openTasks contains the current board (ids, titles, descriptions, notes, owners, assignees, dates, priorities, dependencies). vendorUsers, customerContacts and phases are the only permitted ids. recorder identifies the vendor teammate labelled "You", or is null. meetingCalendar and relativeDateHints are calculated in code from the meeting date, not today's processing date.

PROPOSE ONE COMPLETE BATCH
Call propose_meeting_drafts once, containing every warranted create_task_draft, match_to_existing_task_draft and update_task_status_draft. These proposals do not execute work or return task ids. Assign each new task a unique draftRef (d1, d2, ...); dependencies may refer forward to another draft in this same batch. Do not wait for tool results. Use flag_no_action_items alone only when no new or changed work is warranted.

DECIDE THE WORK BEFORE ITS FIELDS
1. Identify each actual deliverable and whose job it is. Include concrete immediate promises, owned parked requests and dependent work. "After A, we will do B" includes B now as a draft, with A as its dependency. Include short recipient hand-offs and commitments expressed as collective plans. Exclude routine recaps, calendar administration, conversational sign-offs, speculative product ideas with no specific requested deliverable, and rejected ideas. A concrete future output recorded for later is eligible even if delivery is explicitly not committed now. "Nothing to do now", "not in this phase" or "not urgent" does not cancel a request that someone agrees to note/track. Preserve it as an undated, low-priority task owned by whoever carries the future work; do not promise delivery. Mere acknowledgement of a vague possible product/opportunity without a specific agreed output stays out. Exception: cheap optional checks supporting an already committed deliverable are instructions for that task, even if accepted; they are not separately parked work. Put their exact measurement, before/after requirement and qualification in that task's notes. For example "if easy, include before/after timings with the migration" belongs on the migration task. This exception takes precedence over the parked-work rule and over an extraction that mistakenly lists the check separately.
2. Compare the finished outcome with the board. Update only the SAME deliverable, never merely the same topic. A task waiting for an input is different from producing that input. Reviewing/commenting on an artifact is different from finalising the work that awaits that review. Create the separately owned input when it is absent from the board. If the SAME input is already on the board, update it. Do not split an implementation into duplicate tasks merely because its delivery is a PR; put its technical scope in that task's notes.
3. A promised later response or coordination step is separate follow-up work, even if it concerns an existing event or milestone. Preserve the speaker's own commitment as a task rather than burying it in the milestone's notes. When another team's decision is still unknown, create a separate undated vendor reminder to follow up on that choice and make the promised adjustment. Give it the vendor speaker as owner and the unresolved choice as a typed dependency. An existing delivery/event task does not cover this reminder: running an event and following up on an undecided input have different completion conditions. Do not replace the reminder with a milestone update or with a customer notification task. The undecided choice itself is pending-input context, not a task to make a decision nobody has taken on. A courtesy "will do / let you know" acknowledgement about an undecided external choice stays in the vendor reminder's typed dependency; do not create another customer reminder solely for that acknowledgement. This narrow exception applies only to pending-choice acknowledgements. This rule never excludes a customer's concrete hand-off. An explicit promise to send/forward a document, file or email to an internal team is independently owned work even if quick, internal or already mentioned in the sender's notes. Create that recipient-owned hand-off with the sender's delivery as its dependency; do not decide it is too routine to track. Do not assign that response to the person who will supply the input. If a customer is overwhelmed or asks for space, do not create new work for them from that exchange; preserve the vendor's promised check-in instead.
4. For an existing deliverable, propose ONE update containing only changes agreed for THAT task. Keep its owner, assignee, priority and deadline unchanged when only a prerequisite changes. A prerequisite's deadline is not a deadline for the waiting task, and cannot be used to reset its old date. If speakers explicitly single out the task itself as the main blocker to rollout/go-live, that is high-priority evidence for that task. A new prerequisite link alone is not evidence to re-prioritise its parent. A dependency-only update contains only changes.dependsOn and, if needed, genuinely new execution context in changes.appendNotes. Never infer a parent deadline from the input chain. An unchanged restatement needs no update. Reported completion of a board task uses update_task_status_draft with newStatus Done.

OWNERS AND RECIPIENTS
For parked requests, title the requested future output, not the act of acknowledging it. Keep a customer-owned report/model with its customer requester; a vendor merely saying "noted" has not taken over that implementation. Vendor-product changes stay vendor-owned. An explicit "I'll note/track it for the roadmap" does make that teammate responsible for remembering the request.
The actor who commits to doing the work owns it. Match a vendor actor to vendorUsers via ownerId, or a customer actor to customerContacts via assigneeContactId. A recipient, reviewer being notified or person supplying a prerequisite does not become the owner of somebody else's action. Do not set both ownerId and assigneeContactId just to record who receives the result; put recipients in notes. A genuine handover changes the corresponding field on the SAME existing task.
The recorder: "You" is the vendor person who recorded the meeting, never a customer. Resolve their commitments with ownerId = recorder.id. If recorder is null, nobody has said who recorded the meeting: leave ownerId empty and set ownerFromRecorder: true on create_task_draft. Never guess the recorder from vendorUsers. Leave other unresolved owners empty too.

DEPENDENCIES
Once all the deliverables are identified, connect them. Put every explicitly required input on the task that waits for it:
- an existing board task: { taskId: its id }
- another new task in this batch: { draftRef: its draftRef }
- an external condition without an owned task: { text: short blocker wording }
An owned approval/review is work, not merely a text label. A review or verification can require both an artifact and a working environment when the meeting names both as its inputs. Inspect the surrounding turns, including later clarifications; do not rely only on mentionedDependency. Explicitly parallel work must stay independent. Do not invent dependencies from general workflow assumptions, self-links, cycles, or repeat links already on the board. Do not substitute a review/approval step for the named input just because review normally precedes its delivery. If the meeting says work waits for the implementation, link to that implementation task rather than inferring that a reviewer finishing is sufficient. For an existing task, add new links through changes.dependsOn without reassigning or re-timing it. Do not put blocker prose in notes.

DATES
Only give a task a deadline when timing was stated for that task's own work. Use relativeDateHints for the action with the matching sourceQuote. These dates are computed from the meeting date. Use meetingCalendar for weekday lookups. Never move a task's date to accommodate a prerequisite, or label a date with the wrong weekday.
- Explicit calendar dates win over inference.
- by/on a weekday means its next occurrence after the meeting.
- this week / end of the week means this week's Friday; early next week means next Tuesday; end of next week means next Friday; tomorrow means the next day.
- right after this call / today / later today means the meeting day.
- mid-month means the 15th; end of the month means the last day.
- before/ahead of a dated event means the working day before it; by/at the event means its date.
- A conditional event with no fixed date (once an input lands, within a day of approval) stays undated. Do not copy its prerequisite's deadline.
- changes.dueDate = null only when this task's own deadline was explicitly removed.
For a vendor check-back reminder, a stated customer re-engagement window can schedule the reminder even if approximate (mid-month = the 15th). Explain that this is an inferred reminder date, use low confidence, and never turn it into a customer deadline or change the waiting board task's due date. With no stated window, the reminder stays undated.
For timing not covered by a code hint, explain inferred dates in a final, separate "Due date:" paragraph in notes/appendNotes. Code adds that paragraph for resolved relativeDateHints.

EXECUTION NOTES
Preserve each relevant extraction.details fact: exact names of files/systems/metrics, scope, audience, exclusions and negations, acceptance criteria, references, delivery destination, reviewer tagging and measurement instructions. Consult the transcript if details are missing. Use concise sentences without a one/two-sentence cap; never dump the transcript. A dependency removes only its blocker sentence from notes, not the work's other instructions. Optional checks or measurements requested only if cheap belong in the main task's notes. Do not create a separate task unless someone separately commits to tracking or delivering that measurement as its own outcome. For an existing task, changes.appendNotes contains only genuinely new agreed information and never repeats unchanged board details. A progress percentage or unchanged status alone is not new execution scope.

OUTPUT INTEGRITY
Each sourceQuote is one continuous passage copied verbatim from a single speaker's turn, preferably the quote from extraction. Never join speakers, paraphrase quotes or use summary/notes as a quote. Only if the commitment is absent from the transcript may its verbatim Miniti actionItems entry be used. The speaker label is not part of the quote. Multiple changes to one deliverable use the most informative single quote.
Task titles name the action and outcome in at most 80 characters. Put waiting conditions, implementation scope and narrative in dependencies/notes, not in an oversized title. Preserve the scope in those fields.
Every create_task_draft needs a phaseId from phases; choose the best fitting phase, or the first incomplete phase. Use only supplied task/contact/user/phase ids. Confidence high means a clear commitment with owner and timing; medium means one is inferred/unclear; low means tentative work. Never guess missing fields.
Before emitting the batch, account for each eligible extraction item and completion, verify dependent work is present, and check there is only one update per existing task. Do not create no-op updates just to cover restatements.

${GLOBAL_RULES}

Today is {{TODAY}}. Dates spoken in the meeting are relative to meeting.date when it differs.`;

/** `dependsOn` on both draft tools: board tasks, sibling drafts, or plain-text blockers. */
const DEPENDS_ON_SCHEMA = {
  type: "array",
  description: "What this task waits on (see JUDGEMENT RULES E). Each item is exactly ONE of: { taskId } for an open task on the board, { draftRef } for another new task you are proposing in this same response (its create_task_draft's draftRef), or { text } for a blocker that is not a task (a sign-off, another team, an external event). Omit when nothing blocks it.",
  items: {
    type: "object",
    properties: {
      taskId: { type: "integer", description: "An id from openTasks." },
      draftRef: { type: "string", description: "The draftRef of another create_task_draft in this response." },
      text: { type: "string", description: "The blocker in a few words." },
    },
    additionalProperties: false,
  },
};

const DRAFT_TOOLS: Tool[] = [
  {
    name: "create_task_draft",
    description: "Propose creating a new task. Use when an action item is a fresh commitment not covered by any existing open task. Fill in as many fields as the extraction supports; leave the rest null/omitted.",
    input_schema: {
      type: "object",
      properties: {
        draftRef: {
          type: "string",
          description: "REQUIRED. A short id for this draft, unique within this response: \"d1\", \"d2\", ... in the order you propose new tasks. Other drafts name it in dependsOn ({ draftRef }) when they wait on this one.",
        },
        title: {
          type: "string",
          description: "Short imperative task title, max 80 chars. Conditions and background belong in dependencies/notes.",
          maxLength: 80,
        },
        description: {
          type: "string",
          description: "Optional longer description of what the task entails.",
        },
        ownerId: {
          type: "integer",
          description: "Vendor team-mate who owns this work. MUST be an id from vendorUsers. When the recorder (\"You\") made the commitment, recorder.id. Omit if not determinable.",
        },
        ownerFromRecorder: {
          type: "boolean",
          description: "true ONLY when the person who recorded the meeting (\"You\") made this commitment and recorder is null, so ownerId is left empty. Omit otherwise.",
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
      required: ["draftRef", "title", "phaseId", "priority", "sourceQuote", "confidence"],
    },
  },
  {
    name: "match_to_existing_task_draft",
    description: "Propose updating an existing open task instead of creating a duplicate. Use only for the SAME deliverable already in openTasks. Shared topic or a separate prerequisite in its notes is insufficient; propose that distinct work as create_task_draft. One draft per task: put EVERY change agreed on the call for that task in `changes` (new owner or assignee, new due date, new priority, notes to append, new blockers). Only include fields that differ from the board.",
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

/** One tool contains the complete proposal graph. Separate tool calls allowed
 * the model to plan dependent drafts but emit only the first ready calls, then
 * wait for tool results that this proposal-only pipeline never sends. */
const BATCH_TOOL: Tool = {
  name: "propose_meeting_drafts",
  description: "Submit the COMPLETE meeting review batch once. Each calls entry is a draft proposal, not an executed task. Include prerequisites, dependent tasks, existing-task updates and completions together; draftRefs can point forward within this batch. No tool results are needed. Use flag_no_action_items alone only when no draft is warranted.",
  input_schema: {
    type: "object",
    properties: {
      calls: {
        type: "array",
        minItems: 1,
        items: {
          oneOf: DRAFT_TOOLS.map((tool) => ({
            type: "object",
            description: tool.description,
            properties: {
              tool: { type: "string", const: tool.name },
              input: tool.input_schema,
            },
            required: ["tool", "input"],
            additionalProperties: false,
          })),
        },
      },
    },
    required: ["calls"],
    additionalProperties: false,
  },
};

/** Decode one batch atomically into the existing per-draft persistence format. */
export function readOrchestratorCalls(content: unknown[]): OrchestratorToolCall[] {
  const blocks = content.filter((block): block is Record<string, unknown> => !!block && typeof block === "object" && (block as { type?: string }).type === "tool_use");
  if (blocks.length !== 1 || blocks[0].name !== BATCH_TOOL.name) throw new Error("Pass 2 must return one complete draft batch");
  const batch = blocks[0];
  const calls = (batch.input as { calls?: unknown } | null)?.calls;
  if (!Array.isArray(calls) || calls.length === 0) throw new Error("Pass 2 returned an empty or malformed draft batch");
  const names = new Set(DRAFT_TOOLS.map((tool) => tool.name));
  const decoded = calls.map((call: unknown, index): OrchestratorToolCall => {
    const item = call as { tool?: unknown; input?: unknown } | null;
    if (!item || typeof item.tool !== "string" || !names.has(item.tool) || !item.input || typeof item.input !== "object" || Array.isArray(item.input)) {
      throw new Error(`Pass 2 returned a malformed draft at batch index ${index}`);
    }
    return { tool: item.tool, input: item.input as OrchestratorToolInput, id: `${String(batch.id)}_${index}` };
  });
  if (decoded.length > 1 && decoded.some((call) => call.tool === "flag_no_action_items")) throw new Error("Pass 2 mixed no-action with draft proposals");
  return decoded;
}

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

  const meetingCalendar = buildMeetingCalendar(context.meeting?.date) ?? buildMeetingCalendar(context.today);
  const relativeDateHints = buildRelativeDateHints(extraction?.actionItems ?? [], meetingCalendar?.meetingDate ?? context.today);
  const userPayload = { ...context, extraction, meetingCalendar, relativeDateHints };
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
    // leave headroom; a token-limited batch is rejected below, never persisted.
    max_tokens: 10000,
    thinking: { type: "enabled", budget_tokens: 1024 },
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    tools: [BATCH_TOOL],
    // Forced tool selection suppresses thinking before the tool call. The
    // decoder still requires exactly one complete batch before persistence.
    tool_choice: { type: "auto" },
  });

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

  if (response.stop_reason === "max_tokens") throw new Error("Pass 2 draft batch exceeded max_tokens; refusing a partial review batch");
  const calls = normaliseRelativeDraftDates(
    normaliseRecorderOwnership(excludeMeetingAdministration(normaliseDraftQuotes(readOrchestratorCalls(response.content), extraction, context), extraction), extraction, context.recorder),
    relativeDateHints, meetingCalendar?.meetingDate ?? context.today,
  );
  console.log(
    `[miniti] orchestrator (pass 2): ${response.content.length} content blocks, ` +
      `${calls.length} draft proposals`
  );

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
