/**
 * [POST /api/admin/test-webhook] — fire a Miniti fixture at our own
 * webhook for prompt iteration / debugging.
 *
 * Why this lives behind a server route:
 *   - MINITI_WEBHOOK_TOKEN must not leak to the client. We read it here
 *     and forward it as the ?token= query param the receiver expects.
 *   - The fixtures are loaded server-side from
 *     lib/integrations/miniti/fixtures/*.json so the browser never sees
 *     the raw payloads either.
 *
 * Auth-gated like the rest of /admin/* — must be a logged-in vendor.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
// Forwarding to the orchestrator path can take a few seconds; keep the
// budget healthy.
export const maxDuration = 60;

const FIXTURES_DIR = path.join(process.cwd(), "lib/integrations/miniti/fixtures");

/** Whitelist of allowed fixture stems. We re-derive this from the
 *  filesystem at request time so adding a new fixture is just dropping
 *  in a JSON file. */
async function listFixtureNames() {
  try {
    const entries = await fs.readdir(FIXTURES_DIR);
    return entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fixtures = await listFixtureNames();
  return NextResponse.json({ fixtures });
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fixture = String(body?.fixture ?? "").trim();
  if (!fixture) {
    return NextResponse.json({ error: "fixture required" }, { status: 400 });
  }

  // Reject anything that isn't on the filesystem — protects against
  // path traversal and typos.
  const allowed = await listFixtureNames();
  if (!allowed.includes(fixture)) {
    return NextResponse.json(
      { error: `Unknown fixture "${fixture}". Available: ${allowed.join(", ") || "(none)"}` },
      { status: 400 }
    );
  }

  // Re-randomise meeting.id every send so the webhook's idempotency
  // dedup doesn't silently swallow repeat sends. Without this, the
  // second click on the same fixture returns { deduped: true } — handy
  // for testing dedup, but surprising as the default.
  let payload;
  try {
    const raw = await fs.readFile(path.join(FIXTURES_DIR, `${fixture}.json`), "utf8");
    payload = JSON.parse(raw);
    if (payload?.meeting?.id) {
      payload.meeting.id = `${payload.meeting.id}-${Date.now()}`;
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to load fixture: ${err.message}` },
      { status: 500 }
    );
  }

  const token = process.env.MINITI_WEBHOOK_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "MINITI_WEBHOOK_TOKEN not configured" },
      { status: 500 }
    );
  }

  // Derive the webhook URL from the request origin so this works in
  // dev, preview, and prod without hardcoding.
  const origin =
    request.nextUrl.origin ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const webhookUrl = `${origin}/api/integrations/miniti/webhook?token=${encodeURIComponent(token)}`;

  let res;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook request failed: ${err.message}` },
      { status: 502 }
    );
  }

  const responseBody = await res.json().catch(() => ({}));
  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      fixture,
      meetingId: payload.meeting.id,
      response: responseBody,
    },
    { status: res.ok ? 200 : res.status }
  );
}
