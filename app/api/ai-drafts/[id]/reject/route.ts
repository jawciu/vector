/**
 * [POST /api/ai-drafts/[id]/reject] — mark a draft rejected with an optional reason.
 * Rejections feed prompt-tuning later, so the reason is worth capturing.
 *
 * Other drafts from the same meeting may wait on this one (GAPS-PLAN feature
 * 3). Rejecting it keeps that blocker on them as text (lib/db.ts
 * rejectDraftWithLinks); the response lists them as `dependents` so the inbox
 * can say so.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPendingAIChange,
  rejectDraftWithLinks,
  getOrCreateVendorUser,
  DraftConflictError,
} from "@/lib/db";

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

    let reason: string | null = null;
    try {
      const body: { reason?: string | null } | null = await request.json();
      reason = body?.reason ?? null;
    } catch { /* empty body fine */ }

    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });

    const { dependents } = await rejectDraftWithLinks(draftId, { resolvedBy: vu.id, reason });

    return NextResponse.json({ ok: true, ...(dependents.length > 0 && { dependents }) });
  } catch (err) {
    if (err instanceof DraftConflictError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/ai-drafts/[id]/reject]", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to reject draft" },
      { status: 500 }
    );
  }
}
