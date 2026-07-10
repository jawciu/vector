/**
 * inject-meetings.js — replay the Miniti meeting fixtures through the REAL webhook.
 *
 * DEMO DATA ONLY: the fixtures in prisma/fixtures/meetings/*.json carry a
 * `daysAgo` offset instead of a hard-coded `meeting.date`. This script computes
 * `meeting.date = now - daysAgo` at send time so the meeting timeline stays
 * historical relative to whenever it's run. A real integration never fabricates
 * `date` — Miniti sets it when the meeting actually happened.
 *
 * Each fixture is POSTed to the live webhook so the whole pipeline runs for real:
 * heuristic matching → ExternalEvent → orchestrator (Claude Pass 1 + Pass 2) →
 * PendingAIChange drafts → AICall logging. That's what makes the seeded data
 * usable for evals.
 *
 * Usage:
 *   node scripts/inject-meetings.js            # send every fixture in order
 *   node scripts/inject-meetings.js --dry-run  # print what WOULD be sent, send nothing
 *
 * Env:
 *   APP_URL                (default http://localhost:3001) — the running dev server
 *   MINITI_WEBHOOK_TOKEN   (required unless --dry-run)     — matches the receiver
 *
 * Idempotent: the webhook dedups on meeting.id, so re-running never double-inserts.
 * There's a deliberate delay between sends to give the async orchestrator room to
 * finish (and to avoid hammering the Claude API).
 */

import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "prisma", "fixtures", "meetings");

const DRY_RUN = process.argv.includes("--dry-run");
const APP_URL = process.env.APP_URL || "http://localhost:3001";
const TOKEN = process.env.MINITI_WEBHOOK_TOKEN;
const DELAY_MS = 2000; // give the async orchestrator + Claude call room to finish

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** now - daysAgo, as an ISO-8601 string. Anchors the meeting on that calendar
 *  day at midday UTC so it doesn't wobble across a date boundary by timezone. */
function dateFromDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(daysAgo));
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function loadFixtures() {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort(); // numeric prefixes (01..18) sort chronologically
  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
    return { file, raw };
  });
}

async function main() {
  const endpoint = `${APP_URL}/api/integrations/miniti/webhook`;

  if (!DRY_RUN && !TOKEN) {
    console.error("Error: MINITI_WEBHOOK_TOKEN is not set. Set it in .env, or use --dry-run.");
    process.exit(1);
  }

  const fixtures = loadFixtures();
  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Injecting ${fixtures.length} meeting fixtures → ${endpoint}\n`
  );

  const results = [];

  for (const { file, raw } of fixtures) {
    const daysAgo = raw.daysAgo;
    const meeting = raw.payload?.meeting ?? {};
    const date = dateFromDaysAgo(daysAgo);
    // Inject the computed date; fixtures deliberately omit `meeting.date`.
    const payload = {
      ...raw.payload,
      meeting: { ...meeting, date },
    };

    const label = `${file}  (${daysAgo}d ago → ${date.slice(0, 10)})`;

    if (DRY_RUN) {
      console.log(`WOULD POST  ${endpoint}?token=***`);
      console.log(`  ${label}`);
      console.log(`  meeting.id=${meeting.id}  title="${meeting.title}"`);
      console.log(
        `  attendees=${Array.isArray(meeting.attendees) ? meeting.attendees.length : "(none)"}  ` +
          `transcript_turns=${Array.isArray(meeting.transcript) ? meeting.transcript.length : 0}\n`
      );
      results.push({ file, status: "dry-run" });
      continue;
    }

    try {
      const res = await fetch(`${endpoint}?token=${encodeURIComponent(TOKEN)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let body = null;
      try { body = await res.json(); } catch { /* non-JSON error body */ }

      if (res.ok) {
        const bits = body?.deduped
          ? "deduped (already ingested)"
          : `eventId=${body?.eventId} matchedBy=${body?.matchedBy ?? "—"} ambiguous=${body?.ambiguous}`;
        console.log(`OK    ${label}\n      ${bits}\n`);
        results.push({ file, status: res.status, ...body });
      } else {
        console.error(`FAIL  ${label}\n      ${res.status} ${JSON.stringify(body)}\n`);
        results.push({ file, status: res.status, error: body });
      }
    } catch (err) {
      console.error(`ERROR ${label}\n      ${err.message}\n`);
      results.push({ file, status: "error", error: err.message });
    }

    await sleep(DELAY_MS);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === 200 || r.status === "dry-run");
  const deduped = results.filter((r) => r.deduped);
  const ambiguous = results.filter((r) => r.ambiguous);
  const failed = results.filter(
    (r) => r.status !== 200 && r.status !== "dry-run"
  );

  console.log("──────────────────────────────────────────");
  console.log(`Total:     ${results.length}`);
  console.log(`OK:        ${ok.length}${DRY_RUN ? " (dry run — nothing sent)" : ""}`);
  if (!DRY_RUN) {
    console.log(`Deduped:   ${deduped.length}`);
    console.log(`Ambiguous: ${ambiguous.length}`);
    console.log(`Failed:    ${failed.length}`);
  }
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ${f.file}: ${JSON.stringify(f.error ?? f.status)}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
