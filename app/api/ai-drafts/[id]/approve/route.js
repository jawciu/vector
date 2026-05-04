/**
 * [POST /api/ai-drafts/[id]/approve] — execute a draft via the existing mutation paths.
 *
 * Translates the draft's `action` into the matching createTask / updateTask /
 * createComment call, records the appliedTaskId, marks the draft applied.
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
  createTask,
  updateTask,
  createComment,
  getOrCreateVendorUser,
} from "@/lib/db";

export async function POST(request, { params }) {
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

    let body = {};
    try { body = await request.json(); } catch { /* empty body is fine */ }
    // taskId is never overridable — it's a security boundary, not user data.
    const overrides = { ...(body?.overrides ?? {}) };
    delete overrides.taskId;

    // Resolve the approver's VendorUser so we can record resolvedBy.
    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });
    const actor = { type: "vendor", vendorUserId: vu.id };

    // Helper: assert the draft's referenced task belongs to draft.onboardingId.
    // If the task is missing or moved, auto-resolve the draft so it doesn't
    // get stuck in pending forever.
    async function assertTaskBelongs(taskId) {
      const obId = await getTaskOnboardingId(taskId);
      if (obId == null) {
        await markAIChangeRejected(draftId, {
          resolvedBy: vu.id,
          reason: "task no longer exists",
        });
        return { ok: false, status: 410, error: "Target task no longer exists; draft auto-rejected" };
      }
      if (obId !== draft.onboardingId) {
        return { ok: false, status: 400, error: "Draft's target task doesn't belong to its onboarding" };
      }
      return { ok: true };
    }

    let appliedTaskId = null;

    if (draft.action === "create_task") {
      const merged = { ...draft.payload, ...overrides };
      const taskData = {
        onboardingId: draft.onboardingId,
        phaseId: merged.phaseId,
        title: merged.title,
        description: merged.description ?? "",
        status: "Not started",
        due: merged.dueDate || "",
        priority: merged.priority ?? null,
      };
      const task = await createTask(taskData, { actor });
      appliedTaskId = task.id;
    } else if (draft.action === "match_existing") {
      const merged = { ...draft.payload, ...overrides };
      const targetId = draft.payload?.taskId;
      const check = await assertTaskBelongs(targetId);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

      if (merged.action === "comment_only" && merged.commentBody) {
        await createComment(targetId, vu.name, merged.commentBody, { actor });
      } else if (merged.action === "reprioritise" && merged.newPriority) {
        await updateTask(targetId, { priority: merged.newPriority }, { actor });
      } else if (merged.action === "update_due_date" && merged.newDueDate) {
        await updateTask(targetId, { due: merged.newDueDate }, { actor });
      } else if (merged.action === "reassign") {
        await createComment(
          targetId,
          vu.name,
          `Vector flagged a reassignment: ${merged.sourceQuote ?? "(no quote)"}`,
          { actor }
        );
      }
      appliedTaskId = targetId;
    } else if (draft.action === "update_status") {
      const merged = { ...draft.payload, ...overrides };
      const targetId = draft.payload?.taskId;
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
      const merged = { ...draft.payload, ...overrides };
      const targetTaskId = draft.payload?.taskId;
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

    return NextResponse.json({ ok: true, appliedTaskId });
  } catch (err) {
    console.error("[POST /api/ai-drafts/[id]/approve]", err);
    return NextResponse.json(
      { error: err.message || "Failed to approve draft" },
      { status: 500 }
    );
  }
}
