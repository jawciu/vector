import { NextResponse } from "next/server";
import crypto from "crypto";
import { markContactBounced } from "@/lib/db";

/**
 * Resend webhook receiver. Handles email.bounced (hard bounces) and
 * email.complained (spam reports). Marks the contact's email as bounced
 * so we stop trying to send to them.
 *
 * Resend signs webhooks using Svix's standard format. Verify the
 * signature before acting — otherwise anyone could mark any contact as
 * bounced by POSTing forged events.
 */
export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook/resend] RESEND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!verifySignature({ rawBody, svixId, svixTimestamp, svixSignature, secret })) {
    console.warn("[webhook/resend] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = event?.type;
  const recipient = event?.data?.to?.[0] ?? event?.data?.email_address;

  if (!recipient) {
    return NextResponse.json({ ok: true, note: "no recipient in event" });
  }

  if (type === "email.bounced") {
    // Resend's actual path is event.data.bounce.type with values
    // "Permanent" (hard), "Transient" (soft), or "Undetermined".
    const bounceType = (
      event?.data?.bounce?.type ??
      event?.data?.bounce?.bounce_type ??
      event?.data?.bounce_type ??
      ""
    ).toLowerCase();
    if (bounceType === "permanent") {
      const updated = await markContactBounced(recipient);
      return NextResponse.json({ ok: true, marked: updated });
    }
    return NextResponse.json({ ok: true, note: `${bounceType || "unknown"} bounce, ignored` });
  }

  if (type === "email.complained") {
    const updated = await markContactBounced(recipient);
    return NextResponse.json({ ok: true, marked: updated });
  }

  // Other event types (delivered, opened, etc.) — we don't act on them yet.
  return NextResponse.json({ ok: true, note: `unhandled type: ${type}` });
}

function verifySignature({ rawBody, svixId, svixTimestamp, svixSignature, secret }) {
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Replay-attack guard: reject events older than 5 minutes.
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(svixTimestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 5 * 60) return false;

  // Signing secret is "whsec_<base64>" — the base64 part is the raw HMAC key.
  const keyPart = secret.replace(/^whsec_/, "");
  let keyBytes;
  try {
    keyBytes = Buffer.from(keyPart, "base64");
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  // Header format: "v1,<sig> v2,<sig> ..." — any version may match.
  const parts = svixSignature.split(" ");
  for (const part of parts) {
    const [, sig] = part.split(",");
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) return true;
  }
  return false;
}
