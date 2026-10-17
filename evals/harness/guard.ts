/**
 * Safety guard for the eval harness.
 *
 * The eval writes freely (truncates every table between cases), so it must
 * never touch the live demo database that `.env` points at. Every database URL
 * the runner is about to use goes through `assertSafeEvalDbUrl` first.
 *
 * The check runs on what `pg` will ACTUALLY connect to: the URL is parsed with
 * `pg-connection-string`, the same parser `pg` (and so Prisma's adapter-pg)
 * uses. That matters because a query parameter overrides the authority part:
 * `postgresql://u:p@localhost/x?host=live.example.com` connects to
 * live.example.com. So:
 *
 *   1. any `host` or `hostaddr` query parameter is refused outright;
 *   2. the parsed host must be loopback (localhost / 127.0.0.1 / ::1); a Unix
 *      socket path is refused too (the embedded DB is always TCP);
 *   3. the parsed host+port+database must not match any URL in `forbidden`
 *      (the runner passes `.env`'s and the shell's DATABASE_URL and
 *      DIRECT_DATABASE_URL), so a local tunnel to the live DB still fails.
 *
 * The runner adds a fourth, live check: the server's own `inet_server_addr()`
 * must be loopback, and NULL (a socket connection) fails closed.
 *
 * Pure: no I/O, so it is unit-tested in guard.test.ts.
 */

import { parse } from "pg-connection-string";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class UnsafeDbUrlError extends Error {
  constructor(message: string) {
    super(`EVAL DB GUARD: ${message}`);
    this.name = "UnsafeDbUrlError";
  }
}

/** Host, port and database `pg` will use, normalised for comparison. */
function target(url: string): { host: string; port: string; db: string } {
  const c = parse(url);
  return {
    host: String(c.host ?? "").toLowerCase(),
    port: String(c.port || "5432"),
    db: String(c.database || "postgres"),
  };
}

/** Hide the password when a URL has to be printed. */
export function redactDbUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<unparseable url>";
  }
}

/** Query parameters that would redirect the connection away from the URL's host. */
function redirectingParams(url: string): string[] {
  const q = url.indexOf("?");
  if (q < 0) return [];
  const params = new URLSearchParams(url.slice(q + 1));
  return [...params.keys()].filter((k) => k.toLowerCase() === "host" || k.toLowerCase() === "hostaddr");
}

/** Is the server address `inet_server_addr()` reported loopback? NULL (Unix socket) is not. */
export function isLoopbackServerAddr(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return /^(127\.0\.0\.1|::1)(\/\d+)?$/.test(addr);
}

/**
 * Throw unless `url` makes `pg` connect to a loopback Postgres that is not one
 * of `forbidden`. Returns the URL unchanged so it can be used inline.
 */
export function assertSafeEvalDbUrl(url: string | undefined | null, forbidden: (string | undefined | null)[] = []): string {
  if (!url) throw new UnsafeDbUrlError("no database URL given");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new UnsafeDbUrlError("database URL is not parseable");
  }
  if (!/^postgres(ql)?:$/.test(parsedUrl.protocol)) {
    throw new UnsafeDbUrlError(`refusing ${redactDbUrl(url)}: not a postgres:// URL`);
  }
  const redirects = redirectingParams(url);
  if (redirects.length) {
    throw new UnsafeDbUrlError(`refusing ${redactDbUrl(url)}: query parameter "${redirects[0]}" would override the host`);
  }
  let t;
  try {
    t = target(url);
  } catch {
    throw new UnsafeDbUrlError("database URL is not parseable");
  }
  if (t.host.includes(",") || !LOOPBACK_HOSTS.has(t.host)) {
    throw new UnsafeDbUrlError(
      `refusing ${redactDbUrl(url)}: host "${t.host}" is not localhost. The eval only runs against a throwaway local Postgres.`
    );
  }
  for (const f of forbidden) {
    if (!f) continue;
    if (f === url) {
      throw new UnsafeDbUrlError(`refusing ${redactDbUrl(url)}: it is the .env (live) database URL`);
    }
    let ft;
    try {
      ft = target(f);
    } catch {
      continue; // an unparseable forbidden URL cannot collide with a parseable one
    }
    if (ft.host === t.host && ft.port === t.port && ft.db === t.db) {
      throw new UnsafeDbUrlError(`refusing ${redactDbUrl(url)}: same host, port and database as the .env (live) database URL`);
    }
  }
  return url;
}
