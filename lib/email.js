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

/**
 * Render the dark-themed Vector email shell.
 *
 * Why table-based: Gmail, Outlook web, and many mobile clients only fully
 * honour table layout. Inline styles on <body> and <div> get partially
 * stripped or wrapped, which is what caused light backgrounds to bleed
 * through despite our `background:#1D1C24` style.
 *
 * Why the color-scheme meta tags: Gmail (and to a lesser extent Apple Mail)
 * auto-transforms emails it thinks are "light theme being read in dark
 * mode" — flipping backgrounds and text. Declaring the email as `dark`
 * tells Gmail to leave our colours alone.
 */
function renderEmail({ greeting, body, ctaLabel, ctaUrl, footer }) {
  const lines = Array.isArray(body) ? body : [body];
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark only">
  <title>Vector</title>
  <style>
    :root { color-scheme: dark only; supported-color-schemes: dark only; }
    body { margin:0 !important; padding:0 !important; background-color:#18181E !important; }

    /* Gmail (web + iOS + Android) wraps emails it auto-darkens in
       [data-ogsc] (or [data-ogsb]). Targeting these is the only reliable
       way to stop Gmail from re-tinting our already-dark colours into
       light pastels. */
    [data-ogsc] body, [data-ogsb] body,
    u + .body .v-bg, .v-bg {
      background-color:#18181E !important;
    }
    [data-ogsc] .v-bg, [data-ogsb] .v-bg { background-color:#18181E !important; }
    [data-ogsc] .v-card, [data-ogsb] .v-card { background-color:#1D1C24 !important; }
    [data-ogsc] .v-text, [data-ogsb] .v-text { color:#F1EAF1 !important; }
    [data-ogsc] .v-muted, [data-ogsb] .v-muted { color:#999599 !important; }
    [data-ogsc] a.v-cta, [data-ogsb] a.v-cta {
      background-color:#C098FF !important; color:#18181E !important;
    }

    @media (prefers-color-scheme: dark) {
      .v-bg { background-color:#18181E !important; }
      .v-card { background-color:#1D1C24 !important; }
      .v-text { color:#F1EAF1 !important; }
      .v-muted { color:#999599 !important; }
    }
  </style>
</head>
<body class="v-bg body" style="margin:0;padding:0;background-color:#18181E;color:#F1EAF1;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#18181E" class="v-bg" style="background-color:#18181E;width:100%;">
    <tr>
      <td align="center" style="padding:24px;background-color:#18181E;" bgcolor="#18181E" class="v-bg">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#1D1C24" class="v-card" style="background-color:#1D1C24;border:1px solid #25232D;border-radius:12px;max-width:560px;width:100%;">
          <tr>
            <td style="padding:32px;color:#F1EAF1;font-family:${FONT};background-color:#1D1C24;" bgcolor="#1D1C24" class="v-card v-text">
              <p class="v-text" style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#F1EAF1;">${escapeHtml(greeting)}</p>
              ${lines.map((l) => `<p class="v-text" style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#F1EAF1;">${l}</p>`).join("")}
              <p style="margin:24px 0;">
                <a href="${escapeHtml(ctaUrl)}" class="v-cta" style="display:inline-block;background-color:#C098FF;color:#18181E;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;font-family:${FONT};">${escapeHtml(ctaLabel)}</a>
              </p>
              ${footer ? `<p class="v-muted" style="margin:0;font-size:13px;color:#999599;">${escapeHtml(footer)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
