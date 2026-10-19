/**
 * Throwaway local Postgres for the eval harness.
 *
 * startLocalDb():
 *   - starts `embedded-postgres` on a free loopback port, in a fresh temp data
 *     directory (deleted again on stop: `persistent: false`)
 *   - creates the `vector_eval` database
 *   - installs the Supabase stubs the migrations expect (roles `authenticated`,
 *     `anon`, `service_role`; schema `auth` with a dummy `auth.uid()`; an empty
 *     `supabase_realtime` publication)
 *   - applies every `prisma/migrations/<name>/migration.sql` in name order
 *     (the same order Prisma Migrate uses)
 *   - registers cleanup on exit, SIGINT and SIGTERM
 *
 * Works on macOS arm64 and Linux x64 (GitHub Actions): embedded-postgres ships
 * the platform binaries as optional dependencies.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "prisma", "migrations");
const DB_NAME = "vector_eval";
const USER = "postgres";
const PASSWORD = "eval-local-only";

/** What the migrations need from Supabase, minus Supabase. */
const SUPABASE_STUBS = `
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

/**
 * Marker table: the runner only ever truncates a database that carries it.
 * Created by applyMigrations, so a database it did not set up is refused.
 */
export const EVAL_MARKER_TABLE = "_vector_eval_marker";

export type LocalDb = {
  url: string;
  port: number;
  stop: () => Promise<void>;
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Some installs skip the platform package's postinstall (npm's allow-scripts),
 * which rehydrates the shared-library symlinks Postgres needs. Run it here; it
 * is idempotent and swallows "already exists".
 */
function hydratePlatformSymlinks() {
  const require = createRequire(import.meta.url);
  const pkg = `@embedded-postgres/${process.platform}-${process.arch}`;
  let pkgDir: string;
  try {
    pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    return; // not installed for this platform; start() will report it
  }
  const script = path.join(pkgDir, "scripts", "hydrate-symlinks.js");
  if (existsSync(script) && existsSync(path.join(pkgDir, "native", "pg-symlinks.json"))) {
    spawnSync(process.execPath, [script], { cwd: pkgDir, stdio: "ignore" });
  }
}

export function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(MIGRATIONS_DIR, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

export async function applyMigrations(url: string, { log = false } = {}) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(SUPABASE_STUBS);
    for (const name of listMigrations()) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      try {
        await client.query(sql);
      } catch (err) {
        throw new Error(`migration ${name} failed: ${(err as Error).message}`);
      }
      if (log) console.log(`  applied ${name}`);
    }
    await client.query(`CREATE TABLE "${EVAL_MARKER_TABLE}" (created_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`INSERT INTO "${EVAL_MARKER_TABLE}" DEFAULT VALUES`);
  } finally {
    await client.end();
  }
}

export async function startLocalDb({ quiet = true }: { quiet?: boolean } = {}): Promise<LocalDb> {
  hydratePlatformSymlinks();
  const port = await freePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), "vector-eval-pg-"));
  const pgInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: USER,
    password: PASSWORD,
    persistent: false,
    // UTF8 for the transcripts' accented names; C locale so Linux and macOS behave the same.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"],
    onLog: quiet ? () => {} : console.log,
    onError: quiet ? () => {} : console.error,
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await pgInstance.stop();
    } catch {
      // already gone
    }
    rmSync(dataDir, { recursive: true, force: true });
  };

  const onSignal = (signal: NodeJS.Signals) => {
    stop().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("exit", () => {
    // Synchronous best effort, also when a stop() was interrupted: the cluster
    // process is killed by embedded-postgres' own exit hook; the temp dir goes here.
    rmSync(dataDir, { recursive: true, force: true });
  });

  try {
    await pgInstance.initialise();
    await pgInstance.start();
    await pgInstance.createDatabase(DB_NAME);
  } catch (err) {
    await stop();
    throw new Error(`could not start local Postgres: ${(err as Error).message ?? err}`);
  }

  const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/${DB_NAME}`;
  await applyMigrations(url);
  return { url, port, stop };
}
