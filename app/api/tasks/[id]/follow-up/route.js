/**
 * [POST /api/tasks/[id]/follow-up?tone=friendly|firmer|escalation]
 *
 * Edge-runtime SSE stream that produces a `{ subject, body }` follow-up
 * email for the given task. Logs cost to AICall on completion.
 *
 * Edge runtime means we use the Supabase JS client (Prisma's adapter-pg
 * isn't edge-compatible) — same trade-off as the insights streaming route.
 */

export const runtime = "edge";

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "@/lib/ai/client";
import {
  renderFollowupSystemPrompt,
  buildFollowupUserMessage,
  parseFollowupPayload,
  FOLLOWUP_SCHEMA,
  TONES,
} from "@/lib/ai/followup";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req, { params }) {
  const { id: rawId } = await params;
  const taskId = Number(rawId);
  if (Number.isNaN(taskId)) {
    return new Response(JSON.stringify({ error: "Invalid task id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  const tone = searchParams.get("tone") ?? "friendly";
  if (!TONES.includes(tone)) {
    return new Response(JSON.stringify({ error: `Invalid tone "${tone}"` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
      global: { headers: { Cookie: req.headers.get("cookie") ?? "" } },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch task + onboarding + recent comments + assignee. RLS is bypassed
  // because we already authenticated above; queries use the anon-key-based
  // client which goes through PostgREST. RLS is enabled but no SELECT
  // policies are defined → PostgREST will return empty results. Use the
  // service role key instead.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: task, error: taskErr } = await adminClient
    .from("Task")
    .select(`
      id, title, description, status, due, priority, owner, "ownerId", "assigneeContactId", "blockedByTaskId", "onboardingId"
    `)
    .eq("id", taskId)
    .single();
  if (taskErr || !task) {
    return new Response(JSON.stringify({ error: "Task not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [{ data: onboarding }, { data: comments }, { data: assignee }, { data: blockedByTask }, { data: vendorRow }] = await Promise.all([
    adminClient
      .from("Onboarding")
      .select(`id, "targetGoLive", "companyId", Company:Company(name)`)
      .eq("id", task.onboardingId)
      .single(),
    adminClient
      .from("Comment")
      .select(`id, author, body, "createdAt"`)
      .eq("taskId", task.id)
      .order("createdAt", { ascending: true }),
    task.assigneeContactId
      ? adminClient.from("Contact").select(`id, name, email`).eq("id", task.assigneeContactId).single()
      : Promise.resolve({ data: null }),
    task.blockedByTaskId
      ? adminClient.from("Task").select(`id, title, status`).eq("id", task.blockedByTaskId).single()
      : Promise.resolve({ data: null }),
    adminClient.from("VendorUser").select(`id, name, email`).eq("authUserId", user.id).single(),
  ]);

  const vendorName =
    vendorRow?.name ||
    user.user_metadata?.full_name ||
    user.email ||
    "the vendor";

  const userMessage = buildFollowupUserMessage({
    task: { ...task, blockedByTask },
    onboarding: {
      id: onboarding?.id,
      companyName: onboarding?.Company?.name ?? "(unknown company)",
      targetGoLive: onboarding?.targetGoLive ?? null,
    },
    recentComments: comments ?? [],
    assignee,
    vendorName,
    tone,
  });

  let claudeStream;
  try {
    claudeStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: renderFollowupSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
      output_config: { format: { type: "json_schema", schema: FOLLOWUP_SCHEMA } },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Claude call failed: ${err.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

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
        const payload = parseFollowupPayload(final);
        const durationMs = Date.now() - startedAt;

        // Fire-and-forget cost log via the admin client.
        adminClient.from("AICall").insert({
          kind: "followup_draft",
          scopeId: String(taskId),
          model: final.model,
          inputTokens: final.usage.input_tokens ?? 0,
          cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
          outputTokens: final.usage.output_tokens ?? 0,
          costUsd: computeCost(final.model, final.usage),
          durationMs,
          requestId: final.id,
        }).then(({ error }) => {
          if (error) console.warn("[followup] AICall log failed", error);
        });

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, payload })}\n\n`)
        );
        controller.close();
      } catch (err) {
        console.error("[POST /api/tasks/[id]/follow-up] stream error", err);
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
    },
  });
}
