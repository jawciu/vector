/**
 * [GET /api/cron/scan-stale] — Vercel Cron entry point.
 *
 * Runs weekly (Mondays 08:00 UTC, see vercel.json). Authenticates via the
 * Authorization: Bearer $CRON_SECRET header that Vercel sends automatically.
 * Caroline's manual "Scan now" button uses /api/orchestrator/scan-now instead
 * (vendor-authed, scoped to her tasks).
 *
 * GET (not POST) because Vercel Cron only sends GET.
 */

import { NextResponse } from "next/server";
import { scanStaleTasks } from "@/lib/ai/scan-stale";

export const dynamic = "force-dynamic";
// Bump beyond the 10s default — scanning every onboarding can be slow.
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/scan-stale] CRON_SECRET not set");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanStaleTasks({ scopeVendorId: null });
    console.log("[cron/scan-stale] result:", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/scan-stale] failed", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
