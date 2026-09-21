/**
 * demo-warm-insights.js — pre-generate the AI overviews for the seeded demo.
 *
 * Why: the nightly date shift deletes every cached Insight on the seeded
 * portfolio (their prose quotes absolute day counts). Without this, the first
 * visitor to each overview each morning stares at "Generating…" for 5–10s, and
 * a visitor who only glances sees an empty card. With it, every overview opens
 * with content. (After the panel's 4h soft TTL the page still shows the cached
 * insight instantly and refreshes it in the background, so warming once a day
 * is enough to never show an empty card.)
 *
 * What it warms: the portfolio hero ("portfolio" / "all") and one "onboarding"
 * insight per seeded onboarding (Company.logoUrl IS NOT NULL). It does NOT warm
 * the customer-portal insight: that belongs to a signed-in contact.
 *
 * How: exactly what the page does, minus the browser. Same snapshot builder,
 * same hash, same request (lib/ai/insights.js buildInsightRequest), same
 * parser, same saveInsight + logAICall. The page therefore finds a cache row
 * whose contextHash matches and renders it as "fresh".
 *
 *   npx tsx scripts/demo-warm-insights.js            DRY RUN: what would be generated
 *   npx tsx scripts/demo-warm-insights.js --write    generate + save
 *   npx tsx scripts/demo-warm-insights.js --write --force   regenerate even if fresh
 *
 * Cost: ~13 Sonnet calls per run (12 onboardings + portfolio), roughly $0.50.
 * A scope whose cache is already fresh (same hash, under 4h old) is skipped, so
 * a second run the same day is free. One failed scope never fails the run; the
 * script exits 1 only if EVERY scope failed.
 */
import "dotenv/config";
import {
  buildOnboardingSnapshot,
  hashSnapshot,
  buildPortfolioSnapshot,
  hashPortfolioSnapshot,
} from "../lib/ai/context.js";
import { buildInsightRequest, parseInsightPayload } from "../lib/ai/insights.js";
import { anthropic, computeCost } from "../lib/ai/client.js";
import { getOnboardings, getCachedInsight, saveInsight, logAICall } from "../lib/db.js";

const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const SOFT_TTL_MS = 4 * 60 * 60 * 1000; // mirrors InsightsPanel / PortfolioInsightsHero
const CONCURRENCY = 3;

function cacheState(cached, hash) {
  if (!cached) return "missing";
  if (cached.contextHash !== hash) return "stale-hash";
  return Date.now() - new Date(cached.generatedAt).getTime() > SOFT_TTL_MS ? "stale-age" : "fresh";
}

async function plan() {
  const today = new Date();
  const jobs = [];

  const portfolioSnapshot = await buildPortfolioSnapshot({ statusFilter: "Active", today });
  if (portfolioSnapshot) {
    jobs.push({ label: "portfolio", scope: "portfolio", scopeId: "all", snapshot: portfolioSnapshot, hash: hashPortfolioSnapshot(portfolioSnapshot) });
  }

  // Every status, not just Active: completed onboardings have an overview too.
  const all = [];
  for (const status of ["Active", "Completed", "Paused", "Archived"]) all.push(...(await getOnboardings(status)));
  const seeded = all.filter((ob) => ob.companyLogoUrl);
  for (const ob of seeded) {
    const snapshot = await buildOnboardingSnapshot(ob.id, { today });
    if (!snapshot) continue;
    jobs.push({ label: ob.companyName, scope: "onboarding", scopeId: String(ob.id), snapshot, hash: hashSnapshot(snapshot) });
  }

  for (const job of jobs) job.state = cacheState(await getCachedInsight(job.scope, job.scopeId), job.hash);
  return { jobs, today };
}

async function generate(job, today) {
  const startedAt = Date.now();
  const message = await anthropic.messages.create(buildInsightRequest(job.scope, job.snapshot, today));
  const payload = parseInsightPayload(message, job.scope);
  const durationMs = Date.now() - startedAt;
  const usage = message.usage ?? {};
  const costUsd = computeCost(message.model, usage);
  await Promise.all([
    saveInsight({ scope: job.scope, scopeId: job.scopeId, contextHash: job.hash, payload, model: message.model, durationMs }),
    logAICall({
      kind: `insight_${job.scope}`,
      scopeId: job.scopeId,
      model: message.model,
      inputTokens: usage.input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      costUsd,
      durationMs,
      requestId: message.id,
    }),
  ]);
  return { durationMs, costUsd: Number(costUsd) };
}

async function main() {
  const { jobs, today } = await plan();
  const todo = jobs.filter((j) => FORCE || j.state !== "fresh");

  console.log(`Insight warm-up: ${jobs.length} scope(s), ${todo.length} to generate${FORCE ? " (--force)" : ""}\n`);
  for (const j of jobs) console.log(`  ${j.state.padEnd(10)} ${j.scope.padEnd(10)} ${j.scopeId.padStart(4)}  ${j.label}`);

  if (!WRITE) {
    console.log(`\nDRY RUN, nothing generated. ${todo.length} Claude call(s) would run. Add --write to apply.`);
    return 0;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\nANTHROPIC_API_KEY is not set; skipping the warm-up. Overviews will generate on first view.");
    return 0;
  }

  let ok = 0, failed = 0, cost = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const r = await generate(job, today);
        ok += 1; cost += r.costUsd;
        console.log(`  ✓ ${job.label} (${(r.durationMs / 1000).toFixed(1)}s, $${r.costUsd.toFixed(4)})`);
      } catch (err) {
        failed += 1;
        console.error(`  ✗ ${job.label}: ${err?.message ?? err}`);
      }
    }
  }));

  console.log(`\nWarmed ${ok}, failed ${failed}, skipped ${jobs.length - todo.length} already fresh. Cost $${cost.toFixed(4)}.`);
  return todo.length > 0 && ok === 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => { console.error(err); process.exit(1); });
