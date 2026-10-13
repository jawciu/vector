/**
 * Types for the golden answer key (see evals/golden/README.md) and for what
 * the runner collects from the pipeline. Shared by the runner and the scorer;
 * no runtime code here.
 */

export type GapCode =
  | "free_text_dependency"
  | "depends_on_new_draft"
  | "existing_task_notes"
  | "existing_task_dependency"
  | "multi_field_existing_update";

export type Kind = "commitment" | "parked_for_later" | "vendor_reminder";
export type ExpectedAction = "create_task" | "match_existing" | "update_status" | "flag_no_action_items";

export type DependsOn = {
  existingTaskRef?: string;
  newTaskTitleLike?: string;
  freeText?: string;
  gap?: GapCode | GapCode[];
};

export type ExpectedToolCall = {
  action: ExpectedAction;
  // create_task
  titleLike?: string;
  /** Other acceptable wordings; pairing uses the best of titleLike and these. */
  titleAlternatives?: string[];
  owner?: "vendor" | "customer";
  assignee?: string;
  dueDate?: string | null;
  dueDateReason?: string;
  priority?: "low" | "medium" | "high";
  kind?: Kind;
  // match_existing / update_status
  existingTaskRef?: string;
  existingTaskTitleContains?: string;
  newStatus?: string;
  /** null = the update should remove the due date. */
  newDueDate?: string | null;
  newPriority?: "low" | "medium" | "high";
  // shared
  notesContains?: string[];
  dependsOn?: DependsOn | DependsOn[];
  sourceQuoteContains?: string;
  gap?: GapCode | GapCode[];
};

export type BoardTask = {
  ref: string;
  title: string;
  status: string;
  owner: "vendor" | "customer";
  ownerName: string;
  dueDate: string | null;
  priority: string | null;
  notes: string;
  blockedBy: string | null;
};

export type Board = {
  companyPrefix: string;
  companyName: string;
  contacts: { name: string; email?: string | null }[];
  vendorUsers: { name: string; email?: string | null }[];
  tasks: BoardTask[];
};

export type GoldenCase = {
  payload: {
    event: "meeting.saved" | "meeting.updated";
    meeting: {
      id: string;
      title: string;
      date: string;
      duration_seconds?: number;
      action_items?: unknown[];
      transcript?: { speaker?: string; text?: string }[];
      attendees?: { email?: string; name?: string; domain?: string }[];
      [key: string]: unknown;
    };
  };
  board?: Board;
  expected: {
    match: { companyPrefix?: string; ambiguous?: boolean };
    toolCalls: ExpectedToolCall[];
    afterAssign?: { companyPrefix: string; toolCalls: ExpectedToolCall[]; notes?: string };
    notes?: string;
    review?: { verdict: string; reviewedAt: string; by: string };
  };
};

/**
 * One proposal as the scorer sees it: a persisted PendingAIChange, or a
 * `flag_no_action_items` call (the pipeline never persists those, so the
 * runner reads them from ExternalEvent.orchestratorOutput). Database ids are
 * already mapped back to board refs and people's names.
 */
export type Proposal = {
  action: "create_task" | "match_existing" | "update_status" | "flag_no_action_items";
  draftId?: number | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  /** create_task: "vendor" when only a vendor owner is set, "customer" when a customer contact is assigned. */
  ownerSide?: "vendor" | "customer" | null;
  ownerName?: string | null;
  assigneeContactName?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  /** create_task: board ref of the first task blocker (legacy blockedByTaskId, else the first dependsOn task). */
  blockedByRef?: string | null;
  /** match_existing / update_status: board ref of the targeted task. */
  taskRef?: string | null;
  /** match_existing sub-action: reassign | reprioritise | update_due_date (legacy), or add_notes | update (derived from `changes`). */
  updateKind?: string | null;
  newStatus?: string | null;
  newDueDate?: string | null;
  /** match_existing `changes.dueDate: null`: the update removes the due date. */
  clearsDueDate?: boolean;
  newPriority?: string | null;
  /** match_existing `changes.ownerId` / `changes.assigneeContactId`: the new owner, by name. */
  newOwnerName?: string | null;
  sourceQuote?: string | null;
  confidence?: string | null;
  /** Structured dependencies (GAPS-PLAN feature 2): [{ taskRef } | { text }], board refs mapped from task ids; feature 3 keys pass through. Absent on old runs. */
  dependsOn?: unknown;
  /** Future draft-to-draft reference (GAPS-PLAN feature 3), passed through untouched. */
  draftRef?: string | null;
  /** match_existing `changes.appendNotes`: notes appended to the existing task. */
  appendNotes?: string | null;
};

/** A raw Pass 2 tool call, ids mapped to refs where possible, for the groundedness check. */
export type RawCall = {
  tool: string;
  taskId?: number | null;
  taskRef?: string | null;
  blockedByTaskId?: number | null;
  blockedByRef?: string | null;
  /** Task ids cited in dependsOn (create, or an update's changes), with their board refs. Absent when none. */
  dependsOnTaskIds?: { id: number; ref: string | null }[];
  sourceQuote?: string | null;
};

/** Everything the runner collected for one phase of a case (initial delivery or after assignment). */
export type PhaseActual = {
  proposals: Proposal[];
  rawCalls: RawCall[];
  /** Board refs that exist on the board (any status) and refs of open tasks. */
  boardRefs: string[];
  openRefs: string[];
  boardTasks: { ref: string; title: string; status: string; ownerName: string }[];
};

export type CaseActual = {
  match: { companyPrefix: string | null; ambiguous: boolean; matchedBy: string | null };
  transcript: string;
  actionItemsText: string;
  initial: PhaseActual;
  /** Present when the case is ambiguous and has afterAssign. */
  afterAssign?: PhaseActual & { companyPrefix: string };
  /** Case 25 style re-delivery. */
  redelivery?: { deduped: boolean; newDrafts: number };
  error?: string | null;
};
