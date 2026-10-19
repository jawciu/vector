/**
 * Golden-set eval runner.
 *
 *   npm run eval -- --mock-llm                    # whole harness, zero spend
 *   npm run eval                                   # real run, all 30 cases (~$1.60)
 *   npm run eval -- --cases 01,13 --label smoke
 *   npm run eval -- --rescore evals/runs/<file>.json   # re-score a stored run: no DB, no AI, $0
 *
 * Flags
 *   --cases 01,13     subset by case number (file prefix)
 *   --mock-llm        stub the Anthropic client (see harness/mock-llm.ts)
 *   --label <text>    names the run file (default "mock" / "run")
 *   --out <file>      output path (default evals/runs/<YYYY-MM-DD>-<label>.json)
 *   --db-url <url>    use an existing Postgres instead of starting one; it must
 *                     pass the guard (loopback host, not the .env database) and be
 *                     either empty or carry the eval marker table
 *   --no-clock-shift  process meetings at the real "today" instead of the meeting date
 *   --verbose         print the pipeline's own logs
 *   --rescore <file>  re-map and re-score a stored run against the CURRENT answer
 *                     key and scorer; writes <file>-rescored-<YYYY-MM-DD>.json
 *                     (or --out) next to it and never overwrites the original
 *
 * SAFETY: the runner never connects to the .env database. It starts a
 * throwaway embedded Postgres on 127.0.0.1 and runs harness/guard.ts on the
 * URL as pg will parse it before importing any app code. From .env it reads
 * ANTHROPIC_API_KEY and nothing else. Email is disabled (no Resend key).
 *
 * Per case: reset + seed the world and the case's board (harness/seed-case.ts),
 * replay the webhook route's steps with the payload (validate, match, record
 * the ExternalEvent, then the same lib function the route's after() calls),
 * store the RAW output (draft rows, Pass 2 tool calls, Pass 1 extraction, id
 * maps), map it (harness/map-actual.ts) and score it (scoring.ts).
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import pg from "pg";
import { assertSafeEvalDbUrl, isLoopbackServerAddr, redactDbUrl } from "./harness/guard";
import { applyMigrations, EVAL_MARKER_TABLE, startLocalDb, type LocalDb } from "./harness/local-db";
import { seedCase } from "./harness/seed-case";
import { installMockLlm } from "./harness/mock-llm";
import { traceLlm } from "./harness/trace-llm";
import { resetClock, setClock } from "./harness/clock";
import { buildActual, mapsToRaw, type DraftRow, type OutputCall, type RawCase, type RawPhase } from "./harness/map-actual";
import type { CaseActual, GoldenCase } from "./harness/types";
import { formatCount, scoreCase, summarise, summaryLines, type CaseScore, type RunSummary } from "./scoring";

const REPO_ROOT = path.resolve(__dirname, "..");
const GOLDEN_DIR = path.join(__dirname, "golden");
/** Bump when the run-file shape changes. */
const RUN_FILE_VERSION = 3;

type Args = {
  cases: string[] | null;
  mockLlm: boolean;
  label: string | null;
  out: string | null;
  dbUrl: string | null;
  clockShift: boolean;
  verbose: boolean;
  rescore: string | null;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { cases: null, mockLlm: false, label: null, out: null, dbUrl: null, clockShift: true, verbose: false, rescore: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${k} needs a value`);
      return v;
    };
    if (k === "--cases") a.cases = next().split(",").map((s) => s.trim().padStart(2, "0")).filter(Boolean);
    else if (k === "--mock-llm") a.mockLlm = true;
    else if (k === "--label") a.label = next();
    else if (k === "--out") a.out = next();
    else if (k === "--db-url") a.dbUrl = next();
    else if (k === "--no-clock-shift") a.clockShift = false;
    else if (k === "--verbose") a.verbose = true;
    else if (k === "--rescore") a.rescore = next();
    else throw new Error(`unknown flag ${k}`);
  }
  return a;
}

function readDotEnv(): Record<string, string> {
  const file = path.join(REPO_ROOT, ".env");
  return existsSync(file) ? parseDotenv(readFileSync(file)) : {};
}

function gitInfo() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
    const dirty = execSync("git status --porcelain -- lib prisma evals", { cwd: REPO_ROOT }).toString().trim() !== "";
    return { sha, dirty };
  } catch {
    return { sha: null, dirty: null };
  }
}

/** Route the pipeline's console output into a per-case buffer unless --verbose. */
function captureLogs(verbose: boolean) {
  const buf: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  if (!verbose) {
    const sink = (level: string) => (...args: unknown[]) =>
      buf.push(`${level} ${args.map((x) => (typeof x === "string" ? x : x instanceof Error ? x.message : JSON.stringify(x))).join(" ")}`);
    console.log = sink("log");
    console.warn = sink("warn");
    console.error = sink("error");
  }
  return { buf, restore: () => Object.assign(console, orig) };
}

function loadGolden(file: string, caseId?: string): { file: string; golden: GoldenCase } {
  let name = file;
  if (!existsSync(path.join(GOLDEN_DIR, name)) && caseId) {
    // A case file may have been renamed since the run; find it by number.
    const hit = readdirSync(GOLDEN_DIR).find((f) => f.startsWith(`${caseId}-`) && f.endsWith(".json"));
    if (hit) name = hit;
  }
  return { file: name, golden: JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), "utf8")) };
}

type CaseRecord = {
  case: string;
  file: string;
  durationMs: number;
  costUsd: number;
  aiCalls: number;
  error: string | null;
  score: CaseScore | null;
  /** Mapped view the score was computed from (derived from `raw`; kept for reading). */
  actual: CaseActual | null;
  /** Everything the pipeline produced, unmapped. `--rescore` rebuilds `actual` from this. */
  raw: RawCase | null;
  logs?: string[];
  /** Synthetic request bodies + full responses; never SDK options/headers. */
  llmTrace?: ReturnType<ReturnType<typeof traceLlm>>;
};

type RunFile = {
  version?: number;
  label: string;
  createdAt: string;
  git: ReturnType<typeof gitInfo>;
  mockLlm: boolean;
  clockShift: boolean;
  model: string;
  caseCount: number;
  totalCostUsd: number;
  /** Checkpoints are saved after each case; false means an interrupted run. */
  complete?: boolean;
  selectedCaseCount?: number;
  summary: RunSummary;
  cases: CaseRecord[];
  rescoredFrom?: string;
};

function printRun(records: CaseRecord[], summary: RunSummary) {
  for (const r of records) console.log(caseLine(r.case, r.score, r.error, r.costUsd, r.durationMs));
  const totalCost = records.reduce((s, r) => s + r.costUsd, 0);
  console.log("\n" + summaryLines(summary).join("\n"));
  console.log(`Cost:                      $${totalCost.toFixed(4)} (${records.reduce((s, r) => s + r.aiCalls, 0)} Claude calls)`);
}

// ---------------------------------------------------------------------------
// --rescore: no DB, no AI
// ---------------------------------------------------------------------------

function rescore(args: Args) {
  const src = path.resolve(args.rescore!);
  const run: RunFile = JSON.parse(readFileSync(src, "utf8"));
  const records: CaseRecord[] = run.cases.map((r) => {
    const { file, golden } = loadGolden(r.file, r.case);
    if (r.error || (!r.raw && !r.actual)) return { ...r, file, score: null };
    // New run files carry raw output; older ones only the mapped view.
    const actual = r.raw ? buildActual(golden, r.raw) : r.actual!;
    return { ...r, file, actual, score: scoreCase(golden.expected, actual) };
  });
  const summary = summarise(records.map((r) => r.score));
  printRun(records, summary);
  if (!run.cases.every((r) => r.raw)) {
    console.log("\nNote: this run file predates raw storage; re-scored from its stored mapped drafts.");
  }
  const same = JSON.stringify(summary) === JSON.stringify(run.summary);
  const sameCases = records.every((r, i) => JSON.stringify(r.score) === JSON.stringify(run.cases[i].score));
  console.log(`\nVersus the stored scores: summary ${same ? "IDENTICAL" : "CHANGED"}, per-case scores ${sameCases ? "IDENTICAL" : "CHANGED"}`);

  const today = new Date().toISOString().slice(0, 10);
  const out = args.out ? path.resolve(args.out) : src.replace(/\.json$/, "") + `-rescored-${today}.json`;
  const report: RunFile = { ...run, version: RUN_FILE_VERSION, rescoredFrom: path.relative(REPO_ROOT, src), git: gitInfo(), summary, cases: records };
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`Rescored run file: ${path.relative(process.cwd(), out)}`);
}

// ---------------------------------------------------------------------------
// Live run
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.rescore) return rescore(args);
  const dotEnv = readDotEnv();

  // ---- SAFETY GUARD (before any app code is imported) ----
  const forbidden = [dotEnv.DATABASE_URL, dotEnv.DIRECT_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_DATABASE_URL];
  let local: LocalDb | null = null;
  let dbUrl: string;
  if (args.dbUrl) {
    dbUrl = assertSafeEvalDbUrl(args.dbUrl, forbidden);
  } else {
    local = await startLocalDb();
    try {
      dbUrl = assertSafeEvalDbUrl(local.url, forbidden);
    } catch (err) {
      await local.stop();
      throw err;
    }
  }
  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_DATABASE_URL = dbUrl;
  for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "SUPABASE_SERVICE_ROLE_KEY", "MINITI_WEBHOOK_TOKEN", "CRON_SECRET"]) delete process.env[k];
  if (!process.env.ANTHROPIC_API_KEY && dotEnv.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = dotEnv.ANTHROPIC_API_KEY;
  if (args.mockLlm) process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "mock-llm-no-key";

  const pgClient = new pg.Client({ connectionString: dbUrl });
  // On Ctrl-C the cluster shuts down under open connections; don't crash on that.
  pgClient.on("error", (err) => console.error(`[eval] database connection: ${err.message}`));
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (env or .env). Use --mock-llm for a zero-spend run.");
    await pgClient.connect();
    // Live check: the server we reached must say it is loopback. NULL means a
    // Unix socket, which the embedded DB never uses: fail closed.
    const who = (await pgClient.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`)).rows[0];
    if (!isLoopbackServerAddr(who.addr)) {
      throw new Error(`EVAL DB GUARD: server reports address ${who.addr ?? "NULL (socket)"}, not loopback TCP`);
    }
    // Only ever truncate a database the harness set up itself.
    const tables = (await pgClient.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => r.t);
    if (tables.length === 0) await applyMigrations(dbUrl);
    else if (!tables.includes(EVAL_MARKER_TABLE)) {
      throw new Error(`EVAL DB GUARD: database has tables but no "${EVAL_MARKER_TABLE}" marker; refusing to truncate a database the harness did not create`);
    }
    console.log(`Eval database: ${redactDbUrl(dbUrl)} (${local ? "throwaway embedded Postgres" : "--db-url"})`);

    // ---- App code, imported only now that DATABASE_URL is the local one ----
    const db = await import("@/lib/db");
    const miniti = await import("@/lib/integrations/miniti");
    const aiClient = await import("@/lib/ai/client");
    if (args.mockLlm) installMockLlm(aiClient.anthropic);
    const takeTrace = traceLlm(aiClient.anthropic);

    const files = readdirSync(GOLDEN_DIR)
      .filter((f) => /^\d\d-.*\.json$/.test(f))
      .sort()
      .filter((f) => !args.cases || args.cases.includes(f.slice(0, 2)));
    if (files.length === 0) throw new Error("no golden cases selected");
    console.log(`Running ${files.length} case(s)${args.mockLlm ? " with the MOCK LLM (scores are meaningless, plumbing only)" : ""}\n`);

    const today = new Date().toISOString().slice(0, 10);
    const label = (args.label ?? (args.mockLlm ? "mock" : "run")).replace(/[^A-Za-z0-9._-]+/g, "-");
    const out = args.out ? path.resolve(args.out) : path.join(__dirname, "runs", `${today}-${label}.json`);
    if (existsSync(out)) throw new Error(`Run file already exists: ${out}. Choose a new --label or --out; saved calls must not be overwritten.`);
    mkdirSync(path.dirname(out), { recursive: true });
    const git = gitInfo();
    const records: CaseRecord[] = [];
    const saveRun = () => {
      const report: RunFile = {
        version: RUN_FILE_VERSION, label, createdAt: new Date().toISOString(), git,
        mockLlm: args.mockLlm, clockShift: args.clockShift, model: "claude-sonnet-4-6",
        caseCount: records.length, selectedCaseCount: files.length,
        complete: records.length === files.length,
        totalCostUsd: Number(records.reduce((sum, r) => sum + r.costUsd, 0).toFixed(6)),
        summary: summarise(records.map((r) => r.score)), cases: records,
      };
      writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    };
    for (const file of files) {
      const { golden } = loadGolden(file);
      const started = Date.now();
      const cap = captureLogs(args.verbose);
      let raw: RawCase | null = null;
      let error: string | null = null;
      try {
        raw = await runCase(golden, { db, miniti, pgClient, clockShift: args.clockShift });
        error = raw.error;
      } catch (err) {
        error = (err as Error).stack ?? String(err);
      } finally {
        cap.restore();
        resetClock();
      }
      const cost = (await pgClient.query<{ n: string; c: string | null }>(`SELECT count(*) AS n, sum("costUsd") AS c FROM "AICall"`)).rows[0];
      const actual = raw ? buildActual(golden, raw) : null;
      const score = actual && !error ? scoreCase(golden.expected, actual) : null;
      const rec: CaseRecord = {
        case: file.slice(0, 2),
        file,
        durationMs: Date.now() - started,
        costUsd: Number(cost.c ?? 0),
        aiCalls: Number(cost.n),
        error,
        score,
        actual,
        raw,
        logs: cap.buf,
        llmTrace: takeTrace(),
      };
      records.push(rec);
      saveRun();
      console.log(caseLine(rec.case, score, error, rec.costUsd, rec.durationMs));
    }

    // ---- Summary + run file ----
    const summary = summarise(records.map((r) => r.score));
    const totalCost = records.reduce((s, r) => s + r.costUsd, 0);
    console.log("\n" + summaryLines(summary).join("\n"));
    console.log(`Cost:                      $${totalCost.toFixed(4)} (${records.reduce((s, r) => s + r.aiCalls, 0)} Claude calls)`);

    saveRun();
    console.log(`\nRun file: ${path.relative(process.cwd(), out)}`);
    process.exitCode = records.some((r) => r.error) ? 1 : 0;
  } finally {
    await pgClient.end().catch(() => {});
    if (local) await local.stop();
  }
}

function caseLine(id: string, s: CaseScore | null, error: string | null, cost: number, ms: number): string {
  if (!s) return `${id}  ERROR  ${String(error).split("\n")[0]}`;
  const t = s.totals;
  const bits = [
    `${id}`,
    `${s.match.pass ? "match ok " : "MATCH BAD"} (${s.match.actual})`.padEnd(26),
    `recall ${t.recall.count}/${t.recall.total}`.padEnd(12),
    `precision ${t.precision.count}/${t.precision.total}`.padEnd(15),
  ];
  if (s.heldBeforeAssign) bits.push(s.heldBeforeAssign.pass ? "held" : `NOT HELD (${s.heldBeforeAssign.drafts} drafts)`);
  if (s.dedup) bits.push(s.dedup.pass ? "dedup ok" : "DEDUP FAILED");
  if (t.gaps.total) bits.push(`gaps ${formatCount(t.gaps)}`);
  bits.push(`$${cost.toFixed(4)}`, `${(ms / 1000).toFixed(1)}s`);
  return bits.join("  ");
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

type Db = typeof import("@/lib/db");
type Miniti = typeof import("@/lib/integrations/miniti");

async function runCase(
  golden: GoldenCase,
  { db, miniti, pgClient, clockShift }: { db: Db; miniti: Miniti; pgClient: pg.Client; clockShift: boolean }
): Promise<RawCase> {
  const seeded = await seedCase(pgClient, golden.board);
  const maps = mapsToRaw(seeded);
  const meeting = golden.payload.meeting;
  const meetingEnd = new Date(new Date(meeting.date).getTime() + (meeting.duration_seconds ?? 1800) * 1000);
  if (clockShift) setClock(meetingEnd.toISOString());

  // ---- Delivery: the webhook route's steps 2-5, minus HTTP + auth ----
  const deliver = async () => {
    const { event, meeting: m } = miniti.validateMinitiPayload(golden.payload);
    let match: Awaited<ReturnType<Miniti["matchMeetingToOnboarding"]>>;
    try {
      match = await miniti.matchMeetingToOnboarding(m);
    } catch (err) {
      console.error("[eval] match failed:", err);
      match = { onboardingId: null, ambiguous: false, matchedBy: null, candidates: [] };
    }
    const ev = await db.createExternalEvent({
      source: "miniti",
      sourceId: m.id,
      occurredAt: m.date,
      payload: { event, meeting: m },
      onboardingId: match.onboardingId,
      matchAmbiguous: match.ambiguous,
    });
    if (!ev) return { match, eventId: null as number | null, error: null as string | null };
    let error: string | null = null;
    if (match.onboardingId && !match.ambiguous) {
      try {
        await miniti.processMinitiEvent(ev.id, match.onboardingId);
      } catch (err) {
        // Same as the route: record the failure on the event and move on.
        error = String((err as Error).message ?? err);
        await db.markExternalEventProcessed(ev.id, { error }).catch(() => {});
      }
    } else if (match.ambiguous) {
      try {
        await miniti.runMeetingExtractionOnly(ev.id, m);
      } catch (err) {
        console.error("[eval] standalone extraction failed", err);
      }
    }
    return { match, eventId: ev.id, error };
  };

  const first = await deliver();
  if (first.eventId == null) throw new Error("first delivery was deduped; the database was not reset");
  const eventId = first.eventId;

  const initial = await readPhase(pgClient, eventId, new Set());
  const raw: RawCase = {
    maps,
    match: {
      onboardingId: first.match.onboardingId,
      ambiguous: first.match.ambiguous,
      matchedBy: first.match.matchedBy,
      candidates: first.match.candidates,
    },
    initial,
    error: first.error,
  };

  // ---- Ambiguous: a human assigns it (what /api/external-events/[id]/assign does) ----
  const aa = golden.expected.afterAssign;
  if (aa) {
    const obId = seeded.onboardingIdByPrefix.get(aa.companyPrefix);
    if (obId == null) throw new Error(`afterAssign company ${aa.companyPrefix} not seeded`);
    const event = await db.getExternalEvent(eventId);
    if (event && !event.processedAt) {
      if (clockShift) setClock(new Date(meetingEnd.getTime() + 10 * 60 * 1000).toISOString());
      await db.assignExternalEventOnboarding(eventId, obId);
      try {
        await miniti.processMinitiEvent(eventId, obId);
      } catch (err) {
        raw.error = String((err as Error).message ?? err);
        await db.markExternalEventProcessed(eventId, { error: raw.error }).catch(() => {});
      }
      // processMinitiEvent overwrites orchestratorOutput, so the output read here is this phase's only.
      const before = new Set(initial.drafts.map((d) => d.id));
      raw.afterAssign = { ...(await readPhase(pgClient, eventId, before)), companyPrefix: aa.companyPrefix, assigned: true };
    } else {
      // Matched (wrongly) and already processed: a human could not assign it. Scored as misses.
      raw.afterAssign = { drafts: [], orchestratorOutput: null, orchestratorExtraction: null, companyPrefix: aa.companyPrefix, assigned: false };
    }
  }

  // ---- meeting.updated: Miniti re-sends the same meeting; the second must create nothing ----
  if (golden.payload.event === "meeting.updated") {
    const before = await countDrafts(pgClient);
    const second = await deliver();
    raw.redelivery = { deduped: second.eventId == null, newDrafts: (await countDrafts(pgClient)) - before };
  }
  return raw;
}

async function countDrafts(pgClient: pg.Client): Promise<number> {
  return Number((await pgClient.query<{ n: string }>(`SELECT count(*) AS n FROM "PendingAIChange"`)).rows[0].n);
}

/** Raw drafts (minus ids in `exclude`), Pass 2 output and Pass 1 extraction for an event. */
async function readPhase(pgClient: pg.Client, eventId: number, exclude: Set<number>): Promise<RawPhase> {
  const drafts = (
    await pgClient.query<DraftRow>(
      `SELECT id, action, payload, "sourceQuote", confidence FROM "PendingAIChange" WHERE "sourceEventId" = $1 ORDER BY id`,
      [eventId]
    )
  ).rows.filter((d) => !exclude.has(d.id));
  const ev = (
    await pgClient.query<{ orchestratorOutput: OutputCall[] | null; orchestratorExtraction: unknown }>(
      `SELECT "orchestratorOutput", "orchestratorExtraction" FROM "ExternalEvent" WHERE id = $1`,
      [eventId]
    )
  ).rows[0];
  return {
    drafts,
    orchestratorOutput: Array.isArray(ev?.orchestratorOutput) ? ev.orchestratorOutput : null,
    orchestratorExtraction: ev?.orchestratorExtraction ?? null,
  };
}

// Exit explicitly: embedded-postgres pulls in async-exit-hook, whose beforeExit
// handler calls process.exit(0) and would swallow a failing exit code.
main()
  .then(() => process.exit(Number(process.exitCode ?? 0)))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
