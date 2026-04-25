/**
 * [POST /api/insights/[scope]/[id]] — Edge runtime, streams an AI insight.
 *
 * Edge runtime is required so streaming responses can run beyond the 10s
 * Hobby tier Node-function ceiling. Auth still works (`@supabase/ssr`
 * cookies are Edge-compatible). Persistence is delegated to a separate
 * Node route (`/api/insights/save`) since Prisma's `adapter-pg` is not
 * Edge-compatible.
 *
 * Request body:
 *   { snapshot: object, contextHash: string }
 *
 * Response: text/event-stream with these event types
 *   data: { delta: string }   — incremental text delta from Claude
 *   data: { done: true, payload: object, contextHash: string }
 *   data: { error: string }
 *
 * The client persists the final payload by POSTing to /api/insights/save.
 */

export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { anthropic } from "@/lib/ai/client";
import { renderSystemPrompt, INSIGHT_SCHEMA, parseInsightPayload, buildUserMessage } from "@/lib/ai/insights";

export async function POST(req, { params }) {
  const { scope, id } = await params;

  // Auth via Supabase cookies (works in Edge with @supabase/ssr).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
  if (scope !== "onboarding" && scope !== "portfolio") {
    return new Response(JSON.stringify({ error: "Invalid scope" }), { status: 400 });
  }

  const startedAt = Date.now();
  const today = new Date();

  let claudeStream;
  try {
    claudeStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: renderSystemPrompt(today),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserMessage(snapshot) }],
      output_config: { format: { type: "json_schema", schema: INSIGHT_SCHEMA } },
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

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              payload,
              contextHash,
              persistData: {
                scope,
                scopeId: String(id),
                contextHash,
                payload,
                model: final.model,
                usage: final.usage,
                durationMs,
                requestId: final.id,
                kind: `insight_${scope}`,
              },
            })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        console.error("[POST /api/insights/[scope]/[id]] stream error", err);
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
