/**
 * Stale-task scanner — generates follow-up draft suggestions for tasks
 * that look like they need a nudge.
 *
 * Used by:
 *   - /api/cron/scan-stale (weekly Vercel Cron, scans every owned task)
 *   - /api/orchestrator/scan-now (manual trigger, scoped to one vendor)
 *
 * Each draft lands in `PendingAIChange` with action="draft_followup". Approve
 * = "I sent this; mirror it as a portal comment on the task" (no email is
 * actually sent — Caroline opens the mailto link manually). Reject = ignore.
 *
 * Guardrails:
 *   - skip tasks that already have a pending draft_followup
 *   - only tasks with an ownerId — we need an owner to attribute the email to
 */

import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "@/lib/ai/client";
import {
  renderFollowupSystemPrompt,
  buildFollowupUserMessage,
  parseFollowupPayload,
  FOLLOWUP_SCHEMA,
} from "@/lib/ai/followup";
import {
  getOnboardings,
  getTaskForFollowup,
  getTasksForOnboarding,
  createPendingAIChange,
  findPendingDraftFollowupTaskIds,
  getVendorUserById,
  logAICall,
} from "@/lib/db";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OVERDUE_THRESHOLD_DAYS = 5;
const BLOCKED_THRESHOLD_DAYS = 5;

/**
 * Run the scan.
 *
 * @param {object} options
 * @param {number|null} options.scopeVendorId - If set, only scan tasks where
 *   `Task.ownerId === scopeVendorId`. Cron passes null (scan everything);
 *   the manual "Scan now" button passes the calling vendor's id.
 * @returns {Promise<{ scanned, drafted, skipped, byOnboarding }>}
 */
export async function scanStaleTasks({ scopeVendorId = null } = {}) {
  const today = new Date();
  const onboardings = await getOnboardings("Active");

  let scanned = 0;
  let drafted = 0;
  let skipped = 0;
  const byOnboarding = [];

  for (const ob of onboardings) {
    const tasks = await getTasksForOnboarding(ob.id);
    const stale = tasks
      .map((t) => withStaleness(t, today))
      .filter((t) => t.staleness !== null)
      .filter((t) => t.ownerId != null)
      .filter((t) => (scopeVendorId == null ? true : t.ownerId === scopeVendorId))
      .sort((a, b) => b.staleness.severity - a.staleness.severity);

    if (stale.length === 0) continue;

    const taskIds = stale.map((t) => t.id);
    const existing = await findPendingDraftFollowupTaskIds(taskIds);

    let onboardingDrafted = 0;
    for (const t of stale) {
      scanned += 1;
      if (existing.has(t.id)) {
        skipped += 1;
        continue;
      }
      try {
        const draftId = await generateDraftForTask(t.id, t.staleness, ob.id, today);
        if (draftId != null) {
          drafted += 1;
          onboardingDrafted += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        console.error(`[scan-stale] task ${t.id} failed:`, err);
        skipped += 1;
      }
    }

    if (onboardingDrafted > 0) {
      byOnboarding.push({
        onboardingId: ob.id,
        company: ob.companyName,
        drafted: onboardingDrafted,
      });
    }
  }

  return { scanned, drafted, skipped, byOnboarding };
}

/**
 * Classify a task's staleness or return null if not stale enough.
 * `severity` is a rough numeric ordering — used to pick the most urgent
 * tasks first when capping per onboarding.
 */
function withStaleness(task, today) {
  if (task.status === "Done") return { ...task, staleness: null };

  const reasons = [];
  let severity = 0;

  if (task.due) {
    const due = new Date(task.due + "T23:59:59");
    if (!Number.isNaN(due.getTime())) {
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      if (daysOverdue >= OVERDUE_THRESHOLD_DAYS) {
        reasons.push(`overdue by ${daysOverdue} days`);
        severity += daysOverdue;
      }
    }
  }

  if (task.status === "Blocked") {
    reasons.push("blocked");
    severity += BLOCKED_THRESHOLD_DAYS;
  }

  if (reasons.length === 0) return { ...task, staleness: null };

  return {
    ...task,
    staleness: { severity, reasons, summary: reasons.join(" + ") },
  };
}

/** Generate a follow-up draft for one task and persist as a PendingAIChange.
 *  Returns the new draft id, or null if the context lookup failed. */
async function generateDraftForTask(taskId, staleness, onboardingId, today) {
  const ctx = await getTaskForFollowup(taskId);
  if (!ctx) return null;

  let vendorName = ctx.task.owner || "the team";
  let vendorEmail = null;
  let ownerId = ctx.task.ownerId ?? null;
  if (ownerId != null) {
    const vu = await getVendorUserById(ownerId);
    if (vu) {
      vendorName = vu.name || vendorName;
      vendorEmail = vu.email || null;
    }
  }

  const userMessage = buildFollowupUserMessage({
    task: ctx.task,
    onboarding: ctx.onboarding,
    recentComments: ctx.comments,
    assignee: ctx.assignee,
    vendorName,
    tone: "friendly",
  });

  const startedAt = Date.now();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: renderFollowupSystemPrompt(today),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: { type: "json_schema", schema: FOLLOWUP_SCHEMA } },
  });

  const payload = parseFollowupPayload(response);
  const durationMs = Date.now() - startedAt;

  logAICall({
    kind: "scan_stale_followup",
    scopeId: String(taskId),
    model: response.model,
    inputTokens: response.usage.input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    costUsd: computeCost(response.model, response.usage),
    durationMs,
    requestId: response.id,
  }).catch((err) => console.warn("[scan-stale] AICall log failed", err));

  const draft = await createPendingAIChange({
    source: "vector",
    sourceEventId: null,
    onboardingId,
    action: "draft_followup",
    payload: {
      taskId,
      ownerId,
      tone: "friendly",
      subject: payload.subject,
      body: payload.body,
      to: ctx.assignee?.email ?? null,
      toName: ctx.assignee?.name ?? null,
      fromName: vendorName,
      fromEmail: vendorEmail,
      reasons: staleness.reasons,
    },
    sourceQuote: staleness.summary,
    sourceUrl: null,
    confidence: "medium",
  });
  return draft.id;
}
