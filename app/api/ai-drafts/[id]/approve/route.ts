/**
 * [POST /api/ai-drafts/[id]/approve] — execute a draft via the existing mutation paths.
 *
 * Translates the draft's `action` into the matching createTask / updateTask /
 * createComment call, records the appliedTaskId, marks the draft applied.
 *
 * match_existing drafts carry `changes` ({ ownerId?, assigneeContactId?,
 * priority?, dueDate?, appendNotes? }) and are applied as ONE updateTask
 * call; `appendNotes` is appended to the task's notes on a new line stamped
 * `[meeting day, source]` (or today's London date for drafts with no
 * meeting), never overwriting them; `dueDate: null` removes the due date.
 * Legacy single-action drafts (`action` + `newPriority` / `newDueDate`) are
 * normalised by lib/ai/task-update.ts.
 *
 * Dependencies (GAPS-PLAN feature 2): create_task's `dependsOn` and
 * match_existing's `changes.dependsOn` are `[{ taskId } | { text }]` (a legacy
 * `blockedByTaskId` is folded in). Each becomes a TaskDependency row. A blocker
 * task on another onboarding is a 400 (nothing is written); one that is Done
 * or deleted since the draft was made is skipped and listed in the response's
 * `skippedDependencies`.
 *
 * Owners / assignees that no longer exist (create_task and match_existing
 * alike) are a 409 with a plain message the card shows inline. The card asks
 * the reviewer first; an explicit null override means "leave unassigned".
 *
 * Optional body: { overrides: {...} } — when Caroline edited fields before
 * approving (UI's "Edit then approve" / `draft_followup` Send-to-portal path),
 * those overrides are merged into the payload before execution. `taskId` is
 * NOT overridable — it's set at draft-creation time and acts as a security
 * boundary (the draft's target task must belong to draft.onboardingId).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPendingAIChange,
  markAIChangeApplied,
  markAIChangeRejected,
  getTaskOnboardingId,
  getTaskNotes,
  getContactsForOnboarding,
  getVendorUserById,
  getPhasesForOnboarding,
  createTask,
  updateTask,
  createComment,
  getOrCreateVendorUser,
  addTaskDependencies,
  classifyBlockerTasks,
} from "@/lib/db";
import { draftDependsOn, normaliseDependsOn, type DependsOnItem } from "@/lib/task-dependencies";
import type { Actor } from "@/lib/types";
import type { UpdateTaskInput } from "@/lib/db";
import {
  appendDatedNote,
  applyTaskUpdateOverrides,
  invalidChangeFields,
  noteStamp,
  readNoteSource,
  staleContactMessage,
  staleOwnerMessage,
} from "@/lib/ai/task-update";

/**
 * Every payload field this route reads, across all four actions. The column is
 * JSON (model output, older rows predate fields), so everything is optional;
 * `overrides` from the request body share the same shape.
 */
interface ApprovePayload {
  taskId?: number | null;
  // create_task
  phaseId?: number;
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: string | null;
  ownerId?: number | null;
  assigneeContactId?: number | null;
  blockedByTaskId?: number | null;
  dependsOn?: unknown;
  notes?: string;
  // match_existing (current shape: `changes`; the rest is the legacy
  // one-change-per-draft shape, normalised by lib/ai/task-update.ts)
  changes?: Record<string, unknown>;
  appendNotes?: string;
  noteSource?: unknown;
  // Names of the proposed people, snapshotted when the draft was created
  ownerName?: string;
  assigneeContactName?: string;
  action?: string;
  newPriority?: string;
  newDueDate?: string;
  newOwnerId?: number | string | null;
  newAssigneeContactId?: number | string | null;
  sourceQuote?: string;
  // update_status
  newStatus?: string;
  // draft_followup
  fromName?: string;
  subject?: string;
  body?: string;
}

/**
 * The 409 message when a draft's owner is no longer a vendor user, or its
 * customer assignee is no longer a contact on this onboarding; null when both
 * are fine (or unset). `proposed` holds the ids the draft was created with
 * and `names` the names snapshotted with them, so the message can say who.
 */
async function stalePersonError(
  onboardingId: number,
  ownerId: number | null,
  assigneeContactId: number | null,
  proposed: { ownerId?: unknown; assigneeContactId?: unknown } | null | undefined,
  names: ApprovePayload | null = proposed as ApprovePayload | null
): Promise<string | null> {
  const nameFor = (id: number, proposedId: unknown, name: string | undefined) =>
    Number(proposedId) === id ? name ?? null : null;
  if (ownerId != null && !(await getVendorUserById(ownerId))) {
    return staleOwnerMessage(nameFor(ownerId, proposed?.ownerId, names?.ownerName));
  }
  if (assigneeContactId != null) {
    const contacts = await getContactsForOnboarding(onboardingId);
    if (!contacts.some((c) => c.id === assigneeContactId)) {
      return staleContactMessage(nameFor(assigneeContactId, proposed?.assigneeContactId, names?.assigneeContactName));
    }
  }
  return null;
}

/**
 * Check a draft's task blockers against the onboarding before anything is
 * written. Returns the dependencies to create, the blocker ids skipped (Done
 * or deleted), or an error for blockers on another onboarding.
 */
async function vetDependencies(
  onboardingId: number,
  items: DependsOnItem[],
  ownTaskId: number | null = null
): Promise<{ ok: true; items: DependsOnItem[]; skipped: number[] } | { ok: false; error: string }> {
  const taskIds = items.filter((i): i is { taskId: number } => "taskId" in i).map((i) => i.taskId);
  if (ownTaskId != null && taskIds.includes(ownTaskId)) {
    return { ok: false, error: "A task cannot depend on itself" };
  }
  const c = await classifyBlockerTasks(onboardingId, taskIds);
  if (c.foreign.length > 0) {
    return { ok: false, error: "A blocker task belongs to a different onboarding" };
  }
  const skip = new Set([...c.closed, ...c.missing]);
  return {
    ok: true,
    items: items.filter((i) => !("taskId" in i) || !skip.has(i.taskId)),
    skipped: [...skip],
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const draftId = Number(rawId);
    if (Number.isNaN(draftId)) {
      return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const draft = await getPendingAIChange(draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.status !== "pending") {
      return NextResponse.json({ error: `Draft already ${draft.status}` }, { status: 409 });
    }

    let body: { overrides?: ApprovePayload } = {};
    try { body = await request.json(); } catch { /* empty body is fine */ }
    // taskId is never overridable — it's a security boundary, not user data.
    const overrides: ApprovePayload = { ...(body?.overrides ?? {}) };
    delete overrides.taskId;

    // Resolve the approver's VendorUser so we can record resolvedBy.
    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });
    const actor: Actor = { type: "vendor", vendorUserId: vu.id };

    // Helper: assert the draft's referenced task belongs to draft.onboardingId.
    // If the task is missing or moved, auto-resolve the draft so it doesn't
    // get stuck in pending forever.
    async function assertTaskBelongs(taskId: number) {
      const obId = await getTaskOnboardingId(taskId);
      if (obId == null) {
        await markAIChangeRejected(draftId, {
          resolvedBy: vu.id,
          reason: "task no longer exists",
        });
        return { ok: false, status: 410, error: "Target task no longer exists; draft auto-rejected" };
      }
      // `draft` is non-null here (404 above); a hoisted function declaration
      // just doesn't inherit that narrowing.
      if (obId !== draft!.onboardingId) {
        return { ok: false, status: 400, error: "Draft's target task doesn't belong to its onboarding" };
      }
      return { ok: true };
    }

    let appliedTaskId: ApprovePayload["taskId"] = null;
    // Blocker tasks dropped at approval because they were done or deleted.
    let skippedDependencies: number[] = [];
    // Only create_task fills this in. It tells the inbox what was made and
    // where it landed, so the toast can name the task and link to its column
    // instead of leaving the row to just vanish.
    let created: {
      task: Awaited<ReturnType<typeof createTask>>;
      phaseName: string | null;
      onboardingId: number;
    } | null = null;

    if (draft.action === "create_task") {
      const merged = { ...(draft.payload as ApprovePayload), ...overrides };
      // Vector now emits structured ownerId / assigneeContactId / blockedByTaskId
      // / notes alongside the basic fields; createTask accepts all of them.
      //
      // A draft bakes its owner and assignee in at creation, so either can be
      // gone by approval (VendorUser 4 was, when Maya was merged into 8, and
      // Task.ownerId is a real FK, so a dangling id 500'd with a raw Prisma
      // message). We no longer drop it silently: the card warns first and the
      // reviewer picks someone or explicitly leaves it unassigned (an override
      // of null). A stale id that still arrives is a 409 the card shows inline.
      const stored = draft.payload as ApprovePayload | null;
      const ownerId = merged.ownerId ?? null;
      const assigneeContactId = merged.assigneeContactId ?? null;
      const stale = await stalePersonError(draft.onboardingId, ownerId, assigneeContactId, stored);
      if (stale) return NextResponse.json({ error: stale }, { status: 409 });

      // The editor sends the full edited list as overrides.dependsOn; without
      // it, the stored list, or a legacy draft's single blocker.
      const requestedDeps = overrides.dependsOn !== undefined
        ? normaliseDependsOn(overrides.dependsOn)
        : draftDependsOn(merged);
      const vetted = await vetDependencies(draft.onboardingId, requestedDeps);
      if (!vetted.ok) return NextResponse.json({ error: vetted.error }, { status: 400 });
      skippedDependencies = vetted.skipped;

      const taskData = {
        onboardingId: draft.onboardingId,
        // createTask throws "Invalid phase ID" if the draft has none.
        phaseId: merged.phaseId as number,
        title: merged.title,
        description: merged.description ?? "",
        status: "Not started",
        due: merged.dueDate || "",
        priority: merged.priority ?? null,
        ownerId,
        assigneeContactId: merged.assigneeContactId ?? null,
        dependsOn: vetted.items,
        notes: merged.notes ?? "",
      };
      const task = await createTask(taskData, { actor });
      appliedTaskId = task.id;

      const phases = await getPhasesForOnboarding(draft.onboardingId);
      const phase = phases.find((ph) => ph.id === task.phaseId) ?? null;
      // `task` is the same shape POST /api/tasks returns, which is what the
      // board's onTaskCreated already consumes, so the inbox can push it
      // straight into the board's state. phaseName rides alongside for the
      // toast rather than being baked into the task object.
      created = {
        task,
        phaseName: phase?.name ?? null,
        onboardingId: draft.onboardingId,
      };
    } else if (draft.action === "match_existing") {
      const merged = { ...(draft.payload as ApprovePayload), ...overrides };
      // A missing id fails assertTaskBelongs (410) before anything uses it.
      const targetId = (draft.payload as ApprovePayload | null)?.taskId as number;
      const check = await assertTaskBelongs(targetId);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

      // Every change in one update (GAPS-PLAN feature 1). Legacy drafts and
      // legacy editor overrides are folded into `changes` by the normaliser.
      const badFields = invalidChangeFields(overrides.changes);
      if (badFields.length > 0) {
        return NextResponse.json(
          { error: `Invalid change: ${badFields.join(", ")}` },
          { status: 400 }
        );
      }
      const storedPayload = draft.payload as ApprovePayload | null;
      const { changes } = applyTaskUpdateOverrides(storedPayload, overrides);
      // The old tool flagged a reassignment without knowing who to; approving
      // one still records the flag as an audit comment, as before.
      const legacyReassign = storedPayload?.changes === undefined && storedPayload?.action === "reassign";

      // Same rule as create_task: a person who is gone is never dropped
      // silently. The card asks first; a stale id that still arrives is a 409.
      const stale = await stalePersonError(
        draft.onboardingId,
        changes.ownerId ?? null,
        changes.assigneeContactId ?? null,
        storedPayload?.changes as ApprovePayload | undefined,
        storedPayload
      );
      if (stale) return NextResponse.json({ error: stale }, { status: 409 });

      // Vet dependencies before writing anything, so a bad blocker leaves the task untouched.
      let depsToAdd: DependsOnItem[] = [];
      if (changes.dependsOn) {
        const vetted = await vetDependencies(draft.onboardingId, changes.dependsOn, targetId);
        if (!vetted.ok) return NextResponse.json({ error: vetted.error }, { status: 400 });
        depsToAdd = vetted.items;
        skippedDependencies = vetted.skipped;
      }

      const patch: UpdateTaskInput = {};
      if (changes.ownerId !== undefined) patch.ownerId = changes.ownerId;
      if (changes.assigneeContactId !== undefined) patch.assigneeContactId = changes.assigneeContactId;
      if (changes.priority !== undefined) patch.priority = changes.priority;
      // null = remove the due date (Task.due is "" when there is none).
      if (changes.dueDate !== undefined) patch.due = changes.dueDate ?? "";
      if (changes.appendNotes !== undefined) {
        // Append, never overwrite: what a person wrote stays. Stamped with the
        // meeting's day + source when the draft has one, else today in London.
        const current = await getTaskNotes(targetId);
        const stamp = noteStamp(readNoteSource(storedPayload?.noteSource), new Date());
        patch.notes = appendDatedNote(current, changes.appendNotes, stamp);
      }

      if (Object.keys(patch).length === 0 && depsToAdd.length === 0 && !legacyReassign) {
        const allSkipped = changes.dependsOn && skippedDependencies.length > 0;
        return NextResponse.json(
          { error: allSkipped ? "The blocker tasks in this update are done or gone; nothing to apply" : "This update has no changes to apply" },
          { status: 400 }
        );
      }
      if (Object.keys(patch).length > 0) {
        await updateTask(targetId, patch, { actor });
      }
      if (depsToAdd.length > 0) {
        await addTaskDependencies(targetId, depsToAdd);
      }
      if (legacyReassign) {
        await createComment(
          targetId,
          vu.name,
          `Vector flagged a reassignment: ${merged.sourceQuote ?? "(no quote)"}`,
          { actor }
        );
      }
      appliedTaskId = targetId;
    } else if (draft.action === "update_status") {
      const merged = { ...(draft.payload as ApprovePayload), ...overrides };
      // A missing id fails assertTaskBelongs (410) before anything uses it.
      const targetId = (draft.payload as ApprovePayload | null)?.taskId as number;
      const check = await assertTaskBelongs(targetId);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
      await updateTask(targetId, { status: merged.newStatus }, { actor });
      appliedTaskId = targetId;
    } else if (draft.action === "draft_followup") {
      // "Send to portal" — publishes the email body as a Comment visible in
      // the customer portal. Caroline sends the actual email via mailto from
      // the inbox UI; this path only mirrors the content.
      // Comment is attributed to the task owner (whose voice the email is in)
      // and reads cleanly without vendor-side scaffolding: subject becomes
      // the first line if present, then the body. Empty parts are omitted.
      const merged = { ...(draft.payload as ApprovePayload), ...overrides };
      // A missing id fails assertTaskBelongs (410) before anything uses it.
      const targetTaskId = (draft.payload as ApprovePayload | null)?.taskId as number;
      const check = await assertTaskBelongs(targetTaskId);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

      const author = merged.fromName || vu.name;
      const subject = (merged.subject ?? "").trim();
      const bodyText = (merged.body ?? "").trim();
      const commentBody = [subject, bodyText].filter(Boolean).join("\n\n");
      if (commentBody) {
        await createComment(targetTaskId, author, commentBody, { actor });
      }
      appliedTaskId = targetTaskId;
    } else {
      return NextResponse.json(
        { error: `Unknown action ${draft.action}` },
        { status: 400 }
      );
    }

    await markAIChangeApplied(draftId, { resolvedBy: vu.id, appliedTaskId });

    return NextResponse.json({
      ok: true,
      appliedTaskId,
      created,
      ...(skippedDependencies.length > 0 && { skippedDependencies }),
    });
  } catch (err) {
    console.error("[POST /api/ai-drafts/[id]/approve]", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to approve draft" },
      { status: 500 }
    );
  }
}
