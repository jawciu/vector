/**
 * [POST /api/ai-drafts/[id]/reject] — mark a draft rejected with an optional reason.
 * Rejections feed prompt-tuning later, so the reason is worth capturing.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPendingAIChange,
  markAIChangeRejected,
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

    let reason = null;
    try {
      const body = await request.json();
      reason = body?.reason ?? null;
    } catch { /* empty body fine */ }

    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
    });

    await markAIChangeRejected(draftId, { resolvedBy: vu.id, reason });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/ai-drafts/[id]/reject]", err);
    return NextResponse.json(
      { error: err.message || "Failed to reject draft" },
      { status: 500 }
    );
  }
}
