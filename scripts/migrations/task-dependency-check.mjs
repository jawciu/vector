/**
 * Checks for migration 20261013120000_add_task_dependency. Used by
 * apply-task-dependency.sh; can be run on its own.
 *
 *   node scripts/migrations/task-dependency-check.mjs dry-run
 *     Runs the migration SQL inside BEGIN ... ROLLBACK and checks the backfill.
 *     Writes nothing (the transaction always rolls back).
 *   node scripts/migrations/task-dependency-check.mjs verify
 *     After the SQL was applied: the table exists and holds one row per task
 *     with a blockedByTaskId (self-blocks excluded), every pair matching.
 *
 * Target: DIRECT_DATABASE_URL (else DATABASE_URL), from the shell or .env,
 * the same URL prisma.config.ts gives `prisma db execute`.
 * Exit 0 = checks passed, 1 = a check failed, 2 = usage / connection error.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const MIGRATION = "20261013120000_add_task_dependency";
const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, "..", "..", "prisma", "migrations", MIGRATION, "migration.sql");

const mode = process.argv[2];
if (mode !== "dry-run" && mode !== "verify") {
  console.error("usage: task-dependency-check.mjs dry-run|verify");
  process.exit(2);
}
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("DIRECT_DATABASE_URL / DATABASE_URL not set"); process.exit(2); }
const masked = (() => { try { const u = new URL(url); return `${u.hostname}:${u.port || 5432}${u.pathname}`; } catch { return "(unparseable url)"; } })();

const EXPECTED = `select
  count(*)::int as tasks,
  count(*) filter (where "blockedByTaskId" is not null)::int as with_blocker,
  count(*) filter (where "blockedByTaskId" = id)::int as self_blocked`;
const ACTUAL = `select
  (select count(*)::int from "TaskDependency") as rows,
  (select count(*)::int from "TaskDependency" where label is not null) as label_rows,
  (select count(*)::int from "TaskDependency" d join "Task" t on t.id = d."taskId"
     where t."blockedByTaskId" = d."blockedByTaskId") as matching,
  (select count(*)::int from "Task" t where t."blockedByTaskId" is not null and t."blockedByTaskId" <> t.id
     and not exists (select 1 from "TaskDependency" d where d."taskId" = t.id and d."blockedByTaskId" = t."blockedByTaskId")) as missing`;

const client = new pg.Client({ connectionString: url });
try { await client.connect(); } catch (e) { console.error(`cannot connect to ${masked}: ${e.message}`); process.exit(2); }
console.log(`target: ${masked}`);
let ok = false;
try {
  const exists = (await client.query(`select to_regclass('"TaskDependency"') as t`)).rows[0].t;
  if (mode === "dry-run" && exists) { console.log('FAIL: "TaskDependency" already exists (already applied?)'); process.exit(1); }
  if (mode === "verify" && !exists) { console.log('FAIL: "TaskDependency" does not exist: the SQL was not applied. Do NOT run migrate resolve.'); process.exit(1); }
  if (mode === "dry-run") { await client.query("BEGIN"); await client.query(readFileSync(SQL_FILE, "utf8")); }
  const e = (await client.query(`${EXPECTED} from "Task"`)).rows[0];
  const a = (await client.query(ACTUAL)).rows[0];
  const expected = e.with_blocker - e.self_blocked;
  console.log(`tasks ${e.tasks}, with a blocker ${e.with_blocker}, self-blocked (skipped) ${e.self_blocked}`);
  console.log(`TaskDependency rows ${a.rows} (expected ${expected}), matching the old column ${a.matching}, missing ${a.missing}, text rows ${a.label_rows}`);
  ok = mode === "dry-run"
    ? a.rows === expected && a.matching === expected && a.missing === 0 && a.label_rows === 0
    // After going live, people may have added rows; every old-column blocker must still be present.
    : a.missing === 0 && a.rows >= expected;
  console.log(ok ? "OK" : "FAIL: backfill does not match the old column");
} finally {
  if (mode === "dry-run") { await client.query("ROLLBACK").catch(() => {}); console.log("rolled back, nothing written"); }
  await client.end();
}
process.exit(ok ? 0 : 1);
