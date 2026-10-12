import { describe, expect, it } from "vitest";
import { assertSafeEvalDbUrl, isLoopbackServerAddr, redactDbUrl } from "./guard";

const LIVE = "postgresql://postgres.abcdef:secret@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";
const LOCAL = "postgresql://postgres:pw@127.0.0.1:54329/vector_eval";

describe("assertSafeEvalDbUrl", () => {
  it("accepts a loopback URL that is not forbidden", () => {
    expect(assertSafeEvalDbUrl(LOCAL, [LIVE])).toBe(LOCAL);
    expect(assertSafeEvalDbUrl("postgresql://u:p@localhost:5432/x", [LIVE])).toBeTruthy();
    expect(assertSafeEvalDbUrl("postgres://u:p@[::1]:5432/x", [LIVE])).toBeTruthy();
  });

  it("refuses the live .env URL", () => {
    expect(() => assertSafeEvalDbUrl(LIVE, [LIVE])).toThrow(/not localhost/);
  });

  it("refuses any non-loopback host", () => {
    expect(() => assertSafeEvalDbUrl("postgresql://u:p@db.example.com:5432/x")).toThrow(/EVAL DB GUARD/);
  });

  it("refuses a host or hostaddr query parameter that would redirect pg away from localhost", () => {
    expect(() =>
      assertSafeEvalDbUrl("postgresql://u:p@localhost:5432/x?host=aws-0-eu-west-2.pooler.supabase.com&port=6543")
    ).toThrow(/"host" would override the host/);
    expect(() => assertSafeEvalDbUrl("postgresql://u:p@localhost:5432/x?hostaddr=10.0.0.5")).toThrow(/"hostaddr"/);
    expect(() => assertSafeEvalDbUrl("postgresql://u:p@localhost:5432/x?HOST=evil.example.com")).toThrow(/override/);
    // Still refused even if the redirect points at localhost: no redirects at all.
    expect(() => assertSafeEvalDbUrl("postgresql://u:p@localhost:5432/x?host=127.0.0.1")).toThrow(/override/);
  });

  it("refuses Unix sockets, multi-host and non-postgres URLs", () => {
    expect(() => assertSafeEvalDbUrl("postgresql://u:p@%2Ftmp%2Fsock/x")).toThrow(/not localhost/);
    expect(() => assertSafeEvalDbUrl("postgresql://u:p@localhost,evil.example.com:5432/x")).toThrow(/EVAL DB GUARD/);
    expect(() => assertSafeEvalDbUrl("mysql://u:p@localhost:3306/x")).toThrow(/not a postgres/);
  });

  it("refuses a loopback URL that is the .env URL (e.g. a tunnel to live)", () => {
    const tunnel = "postgresql://u:p@localhost:6543/postgres";
    expect(() => assertSafeEvalDbUrl(tunnel, [tunnel])).toThrow(/live/);
    expect(() => assertSafeEvalDbUrl("postgresql://other:pw@localhost:6543/postgres", [tunnel])).toThrow(/same host, port and database/);
  });

  it("refuses empty and unparseable URLs", () => {
    expect(() => assertSafeEvalDbUrl(undefined)).toThrow(/no database URL/);
    expect(() => assertSafeEvalDbUrl("not a url")).toThrow(/not parseable/);
  });

  it("redacts passwords", () => {
    expect(redactDbUrl(LOCAL)).not.toContain("pw@");
  });
});

describe("isLoopbackServerAddr", () => {
  it("accepts loopback and fails closed on NULL (socket) or remote", () => {
    expect(isLoopbackServerAddr("127.0.0.1/32")).toBe(true);
    expect(isLoopbackServerAddr("::1/128")).toBe(true);
    expect(isLoopbackServerAddr(null)).toBe(false);
    expect(isLoopbackServerAddr("10.1.2.3/32")).toBe(false);
  });
});
