/**
 * [PATCH /api/ai-drafts/[id]] — autosave edits to a pending draft's payload.
 *
 * Used by the AIDraftInbox `draft_followup` editor: every keystroke (debounced)
 * sends the latest subject/body so the persisted draft stays in sync. Only
 * keys present in the request body are merged; everything else is preserved.
 *
 * Body: { payload: { subject?: string, body?: string, ... } }
 *
 * Returns 204 on success, 404 if the draft is missing or already resolved.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updatePendingAIChangePayload, getPendingAIChange } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { id: rawId } = await params;
  const draftId = Number(rawId);
  if (Number.isNaN(draftId)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch = body?.payload;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "payload required" }, { status: 400 });
  }

  // Length caps — defence-in-depth against pathological input. Subject + body
  // get mirrored into a Comment visible in the customer portal.
  if (typeof patch.subject === "string" && patch.subject.length > 400) {
    return NextResponse.json({ error: "subject too long" }, { status: 400 });
  }
  if (typeof patch.body === "string" && patch.body.length > 8000) {
    return NextResponse.json({ error: "body too long" }, { status: 400 });
  }

  const updated = await updatePendingAIChangePayload(draftId, patch);
  if (!updated) {
    // Either missing or already resolved.
    const draft = await getPendingAIChange(draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    return NextResponse.json(
      { error: `Draft is ${draft.status}; can't edit` },
      { status: 409 }
    );
  }

  return new Response(null, { status: 204 });
}
