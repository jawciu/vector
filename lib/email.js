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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmail({ greeting, body, ctaLabel, ctaUrl, footer }) {
  const lines = Array.isArray(body) ? body : [body];
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#18181E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#F1EAF1;">
  <div style="max-width:560px;margin:0 auto;background:#1D1C24;border:1px solid #25232D;border-radius:12px;padding:32px;">
    <p style="margin:0 0 16px;font-size:15px;color:#F1EAF1;">${escapeHtml(greeting)}</p>
    ${lines.map((l) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#F1EAF1;">${l}</p>`).join("")}
    <p style="margin:24px 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#C098FF;color:#18181E;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${escapeHtml(ctaLabel)}</a></p>
    ${footer ? `<p style="margin:0;font-size:13px;color:#999599;">${escapeHtml(footer)}</p>` : ""}
  </div>
</body></html>`;
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
  const html = renderEmail({
    greeting: `Hi ${contactName || "there"},`,
    body: [
      `${escapeHtml(CSM_NAME)} from ${escapeHtml(SENDER_COMPANY)} invited you to the ${escapeHtml(companyName)} onboarding portal.`,
    ],
    ctaLabel: "Open your portal",
    ctaUrl: portalUrl,
    footer: `This link is personal to you and expires on ${expiryDate}.`,
  });

  return sendInternal({ to, subject, text, html, label: "sendPortalInvite" });
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
  const html = renderEmail({
    greeting: `Hi ${contactName || "there"},`,
    body: [
      `${escapeHtml(CSM_NAME)} from ${escapeHtml(SENDER_COMPANY)} has assigned you a task on the ${escapeHtml(companyName)} onboarding:`,
      `<strong>${escapeHtml(taskTitle)}</strong>`,
    ],
    ctaLabel: "Open your portal",
    ctaUrl: portalUrl,
  });
  return sendInternal({ to, subject, text, html, label: "sendTaskAssigned" });
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
  const htmlBody = [
    `${escapeHtml(authorName)} from ${escapeHtml(SENDER_COMPANY)} commented on your task <strong>${escapeHtml(taskTitle)}</strong> on the ${escapeHtml(companyName)} onboarding:`,
  ];
  if (excerpt) {
    htmlBody.push(
      `<span style="display:block;padding:12px 16px;background:#26242F;border-left:3px solid #C098FF;border-radius:4px;color:#CAC7CA;">${escapeHtml(excerpt)}</span>`
    );
  }
  const html = renderEmail({
    greeting: `Hi ${contactName || "there"},`,
    body: htmlBody,
    ctaLabel: "Open your portal to reply",
    ctaUrl: portalUrl,
  });
  return sendInternal({ to, subject, text, html, label: "sendTaskCommented" });
}

async function sendInternal({ to, subject, text, html, label }) {
  if (!resend) {
    console.log(`[email:stub] ${label}`, { to, subject, text });
    return { ok: true, stub: true };
  }
  try {
    const payload = { from, to, subject, text };
    if (html) payload.html = html;
    const { error } = await resend.emails.send(payload);
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
