/**
 * Follow-up draft generator — system prompt + schema for the
 * "Draft follow-up with Vector" button on the task drawer.
 *
 * Per PLAN.md §3.1: vendor clicks "Draft follow-up" on a blocked / overdue
 * task → Claude writes a contextual email → vendor reviews + edits + sends
 * manually (we never auto-send). Three tone options: friendly / firmer /
 * escalation.
 *
 * Used by: app/api/tasks/[id]/follow-up/route.js (Edge runtime).
 */

const TONE_DESCRIPTIONS = {
  friendly:
    "Warm and collaborative. Assume good intent. First-name basis. Phrasing like 'wanted to check in' or 'circling back'. No urgency cues.",
  firmer:
    "Direct and concrete. Name the blocker explicitly. Ask for a specific date or status update. Polite but clear that this needs movement.",
  escalation:
    "Raise the stakes politely. Acknowledge that the task has been stuck for a while. Suggest looping in a more senior stakeholder (executive sponsor, manager). Be explicit about downstream impact.",
};

const SYSTEM_PROMPT = `You are Vector. You write follow-up messages for B2B customer onboarding tasks that have been blocked, overdue, or stalled. The vendor will review your draft, edit if needed, and send it manually — you NEVER auto-send.

You will receive: the task (title, description, status, due date, days overdue / blocked, owner, assignee), the onboarding context (company name, phase), recent comments, vendor's name, and a tone selection.

Produce a follow-up email with two fields:
- subject: brief and specific (max ~70 chars). Reference the task or onboarding — never "Following up" alone.
- body: 2–4 short paragraphs, plain text, no markdown, no greetings like "I hope this email finds you well".

Tone rules:
- friendly: ${TONE_DESCRIPTIONS.friendly}
- firmer: ${TONE_DESCRIPTIONS.firmer}
- escalation: ${TONE_DESCRIPTIONS.escalation}

Hard rules:
1. NO generic openers ("I hope you're well", "Just checking in").
2. Reference at least one specific detail from the task or recent comments — proves it's not a template.
3. Suggest a concrete next action (a date, a meeting, a specific deliverable they need to send).
4. Sign off with the vendor's name. No "Best regards" template fluff — keep the sign-off natural ("Thanks, {name}" or just "{name}").
5. Match the customer's likely tone — B2B SaaS context, professional but not stiff.
6. If the task has an assignee with a name, address them by first name. If no name, open with "Hi" or a context-relevant opener.

Today is {{TODAY}}.`;

/** JSON schema enforced by Anthropic structured outputs. Keep simple — no
 *  maxLength (unsupported by `output_config.format`); length is enforced
 *  via the system prompt. */
export const FOLLOWUP_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

/** Build the system prompt with today's date interpolated. */
export function renderFollowupSystemPrompt(today = new Date()) {
  return SYSTEM_PROMPT.replace("{{TODAY}}", today.toISOString().slice(0, 10));
}

/** Compose the user message Claude receives. */
export function buildFollowupUserMessage({ task, onboarding, recentComments = [], assignee = null, vendorName = "the vendor", tone = "friendly" }) {
  return JSON.stringify({
    tone,
    vendorName,
    today: new Date().toISOString().slice(0, 10),
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      dueDate: task.due || null,
      priority: task.priority || null,
      daysOverdue: computeDaysOverdue(task.due, task.status),
      owner: task.owner || null,
      assignee: assignee
        ? { id: assignee.id, name: assignee.name, email: assignee.email || null }
        : null,
      blockedByTask: task.blockedByTask
        ? { id: task.blockedByTask.id, title: task.blockedByTask.title, status: task.blockedByTask.status }
        : null,
    },
    onboarding: {
      id: onboarding.id,
      companyName: onboarding.companyName,
      phase: onboarding.phase || null,
      targetGoLive: onboarding.targetGoLive || null,
    },
    recentComments: recentComments.slice(-6).map((c) => ({
      author: c.author,
      body: c.body,
      createdAt: c.createdAt,
    })),
  });
}

/** Pull the parsed { subject, body } out of a Claude message. */
export function parseFollowupPayload(message) {
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Claude response");
  return JSON.parse(textBlock.text);
}

function computeDaysOverdue(due, status) {
  if (!due || status === "Done") return null;
  const dueDate = new Date(due + "T23:59:59");
  if (Number.isNaN(dueDate.getTime())) return null;
  const days = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

export const TONES = Object.keys(TONE_DESCRIPTIONS);
