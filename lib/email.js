import { Resend } from "resend";

const SENDER_COMPANY = "Vector";
const CSM_NAME = "Caroline Jaworsky";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || `${SENDER_COMPANY} <onboarding@example.com>`;
const resend = apiKey ? new Resend(apiKey) : null;

function buildPortalUrl(token) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/portal/auth?token=${token}`;
}

function formatExpiryDate(expiresAt) {
  return new Date(expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Send a portal invite email. Returns { ok, stub?, error? }.
 *  If RESEND_API_KEY is not set, logs the payload and returns { ok: true, stub: true }. */
export async function sendPortalInvite({ to, contactName, companyName, token, expiresAt }) {
  if (!to) {
    return { ok: false, error: "no_email" };
  }

  const portalUrl = buildPortalUrl(token);
  const expiryDate = formatExpiryDate(expiresAt);

  const subject = `Your ${companyName} onboarding portal is ready`;
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `${CSM_NAME} from ${SENDER_COMPANY} invited you to the ${companyName} onboarding portal.\n\n` +
    `Open your portal: ${portalUrl}\n\n` +
    `This link is personal to you and expires on ${expiryDate}.\n`;

  return sendInternal({ to, subject, text, label: "sendPortalInvite" });
}

/** Email a contact that a task has been newly assigned to them. */
export async function sendTaskAssigned({ to, contactName, companyName, taskTitle, token }) {
  if (!to) return { ok: false, error: "no_email" };
  const portalUrl = buildPortalUrl(token);
  const subject = `New task on your ${companyName} onboarding: "${taskTitle}"`;
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `${CSM_NAME} from ${SENDER_COMPANY} has assigned you a task on the ${companyName} onboarding:\n\n` +
    `  "${taskTitle}"\n\n` +
    `Open your portal to get started: ${portalUrl}\n`;
  return sendInternal({ to, subject, text, label: "sendTaskAssigned" });
}

/** Email a contact that a vendor has commented on a task they own. */
export async function sendTaskCommented({ to, contactName, companyName, taskTitle, authorName, excerpt, token }) {
  if (!to) return { ok: false, error: "no_email" };
  const portalUrl = buildPortalUrl(token);
  const subject = `${authorName} commented on "${taskTitle}"`;
  const excerptLine = excerpt ? `\n  "${excerpt}"\n` : "";
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `${authorName} from ${SENDER_COMPANY} commented on your task on the ${companyName} onboarding:\n${excerptLine}\n` +
    `Open your portal to reply: ${portalUrl}\n`;
  return sendInternal({ to, subject, text, label: "sendTaskCommented" });
}

async function sendInternal({ to, subject, text, label }) {
  if (!resend) {
    console.log(`[email:stub] ${label}`, { to, subject, text });
    return { ok: true, stub: true };
  }
  try {
    const { error } = await resend.emails.send({ from, to, subject, text });
    if (error) {
      console.error(`[email:${label}] Resend error:`, error);
      return { ok: false, error: error.message || "email_failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[email:${label}] send threw:`, err);
    return { ok: false, error: err.message || "email_failed" };
  }
}
