/**
 * [POST /api/insights/save] — Node runtime, persists an insight + AI call log.
 *
 * Called by the InsightsPanel client component after the streaming Edge
 * route's stream completes. Splits Edge (streaming) and Node (Prisma
 * persistence) since Prisma's adapter-pg is not Edge-compatible.
 *
 * Body shape (passed through from the Edge route's `persistData`):
 *   { scope, scopeId, contextHash, payload, model, usage, durationMs,
 *     requestId, kind }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveInsight, logAICall } from "@/lib/db";
import { computeCost } from "@/lib/ai/client";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      scope,
      scopeId,
      contextHash,
      payload,
      model,
      usage,
      durationMs,
      requestId,
      kind,
    } = body ?? {};

    if (!scope || !scopeId || !contextHash || !payload || !model || !usage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const costUsd = computeCost(model, usage);

    const [insight] = await Promise.all([
      saveInsight({ scope, scopeId, contextHash, payload, model, durationMs }),
      logAICall({
        kind: kind ?? `insight_${scope}`,
        scopeId,
        model,
        inputTokens: usage.input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        costUsd,
        durationMs,
        requestId,
      }),
    ]);

    return NextResponse.json({ id: insight.id, costUsd });
  } catch (error) {
    console.error("[POST /api/insights/save]", error);
    return NextResponse.json(
      { error: error.message || "Failed to save insight" },
      { status: 500 }
    );
  }
}
