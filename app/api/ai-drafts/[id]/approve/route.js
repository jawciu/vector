/**
 * [POST /api/ai-drafts/[id]/approve] — execute a draft via the existing mutation paths.
 *
 * Translates the draft's `action` into the matching createTask / updateTask /
 * createComment call, records the appliedTaskId, marks the draft applied.
 *
 * Optional body: { overrides: {...} } — when Caroline edited fields before
 * approving (UI's "Edit then approve" path), those overrides are merged into
 * the payload before execution.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPendingAIChange,
  markAIChangeApplied,
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
    const overrides = body?.overrides ?? {};

    // Resolve the approver's VendorUser so we can record resolvedBy.
    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });
    const actor = { type: "vendor", vendorUserId: vu.id };

    let appliedTaskId = null;

    if (draft.action === "create_task") {
      const merged = { ...draft.payload, ...overrides };
      // Map "owner: vendor|customer" → DB columns. v1: vendor → ownerId=vu, customer → leave unassigned (Caroline assigns a contact later).
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
      const targetId = merged.taskId;
      if (merged.action === "comment_only" && merged.commentBody) {
        await createComment(targetId, vu.name, merged.commentBody, { actor });
      } else if (merged.action === "reprioritise" && merged.newPriority) {
        await updateTask(targetId, { priority: merged.newPriority }, { actor });
      } else if (merged.action === "update_due_date" && merged.newDueDate) {
        await updateTask(targetId, { due: merged.newDueDate }, { actor });
      } else if (merged.action === "reassign") {
        // v1: leave assignment to manual flow — record a comment instead.
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
      await updateTask(merged.taskId, { status: merged.newStatus }, { actor });
      appliedTaskId = merged.taskId;
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
