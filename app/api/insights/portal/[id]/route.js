/**
 * [POST /api/insights/portal/[id]] — Node runtime, customer-facing insight.
 *
 * Streams a customer-voice AI summary for one onboarding. Mirrors the vendor
 * Edge route at /api/insights/[scope]/[id] but:
 *   - runs in Node so it can validate the portal_token cookie via Prisma
 *     (validatePortalWithReason) and persist the insight + AI call directly
 *     (no separate /save round-trip).
 *   - uses scope="portal" for prompt, schema, and cache key — vendor and
 *     customer insights for the same onboarding live as separate cache rows.
 *
 * Request body:
 *   { snapshot: object, contextHash: string }
 *
 * Response: text/event-stream with these event types
 *   data: { delta: string }
 *   data: { done: true, payload: object, contextHash: string }
 *   data: { error: string }
 */

import { validatePortalWithReason } from "@/lib/portal-auth";
import { anthropic, computeCost } from "@/lib/ai/client";
import { renderSystemPrompt, getInsightSchema, parseInsightPayload, buildUserMessage } from "@/lib/ai/insights";
import { saveInsight, logAICall } from "@/lib/db";

export async function POST(req, { params }) {
  const { id } = await params;

  const { session, error: authError } = await validatePortalWithReason(id);
  if (!session) {
    return new Response(JSON.stringify({ error: authError ?? "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { snapshot, contextHash } = body ?? {};
  if (!snapshot || !contextHash) {
    return new Response(
      JSON.stringify({ error: "snapshot and contextHash required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const startedAt = Date.now();
  const today = new Date();

  let claudeStream;
  try {
    claudeStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: renderSystemPrompt("portal", today),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserMessage(snapshot) }],
      output_config: { format: { type: "json_schema", schema: getInsightSchema("portal") } },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Claude call failed to start: ${err.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of claudeStream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: ev.delta.text })}\n\n`)
            );
          }
        }
        const final = await claudeStream.finalMessage();
        const payload = parseInsightPayload(final);
        const durationMs = Date.now() - startedAt;
        const usage = final.usage ?? {};

        // Persist server-side — portal users don't have a Supabase session,
        // so they can't hit /api/insights/save (which is auth-gated).
        try {
          const costUsd = computeCost(final.model, usage);
          await Promise.all([
            saveInsight({
              scope: "portal",
              scopeId: String(id),
              contextHash,
              payload,
              model: final.model,
              durationMs,
            }),
            logAICall({
              kind: "insight_portal",
              scopeId: id,
              model: final.model,
              inputTokens: usage.input_tokens ?? 0,
              cacheReadTokens: usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              costUsd,
              durationMs,
              requestId: final.id,
            }),
          ]);
        } catch (persistErr) {
          console.warn("[POST /api/insights/portal/[id]] persist failed", persistErr);
          // Non-fatal — still send the payload to the client.
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, payload, contextHash })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        console.error("[POST /api/insights/portal/[id]] stream error", err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Context-Hash": contextHash,
    },
  });
}
