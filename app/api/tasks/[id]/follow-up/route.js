/**
 * [POST /api/tasks/[id]/follow-up?tone=friendly|firmer|escalation]
 *
 * Streams a `{ subject, body }` follow-up email for the given task. Logs cost
 * to AICall on completion.
 *
 * Runs on Node so we can use Prisma via lib/db.js — same DB layer as the
 * rest of the app. Streaming still works fine through ReadableStream. Hobby
 * tier's 10s function ceiling is the constraint; follow-up gen typically
 * runs ~3–8s so we're inside the budget.
 */

import { createClient as createSSRClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "@/lib/ai/client";
import { getTaskForFollowup, getOrCreateVendorUser, logAICall } from "@/lib/db";
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

  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ctx = await getTaskForFollowup(taskId);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "Task not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let vendorName = user.user_metadata?.full_name || user.email || "the vendor";
  try {
    const vu = await getOrCreateVendorUser({
      authUserId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name,
    });
    if (vu?.name) vendorName = vu.name;
  } catch (err) {
    console.warn("[followup] vendor lookup failed", err);
  }

  const userMessage = buildFollowupUserMessage({
    task: ctx.task,
    onboarding: ctx.onboarding,
    recentComments: ctx.comments,
    assignee: ctx.assignee,
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

        logAICall({
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
        }).catch((err) => console.warn("[followup] AICall log failed", err));

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
