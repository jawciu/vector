import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The proxy is tested against a fake Supabase client so we can put the session
// into states the auth server would otherwise have to produce for us: live,
// and "revoked server-side but the access token has not expired yet".
const state = {
  user: null,
  signInCalls: 0,
  signInFails: false,
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url, _key, { cookies }) => ({
    auth: {
      // getUser() asks the auth server, so a revoked session reads as no user
      // even while its JWT still verifies locally.
      // getClaims() only verifies the JWT locally, so it still reports a
      // revoked session as signed in. Present here so this test fails if the
      // proxy ever goes back to trusting it.
      getClaims: async () => ({ data: { claims: { sub: "demo-user" } }, error: null }),
      getUser: async () =>
        state.user
          ? { data: { user: state.user }, error: null }
          : { data: { user: null }, error: { message: "session_not_found" } },
      signInWithPassword: async () => {
        state.signInCalls += 1;
        if (state.signInFails) return { data: null, error: { message: "nope" } };
        state.user = { id: "demo-user" };
        cookies.setAll([
          { name: "sb-test-auth-token", value: "fresh-session", options: { path: "/" } },
        ]);
        return { data: { user: state.user }, error: null };
      },
    },
  }),
}));

const { updateSession } = await import("./proxy.js");
const { NextRequest } = await import("next/server");

function apiRequest() {
  return new NextRequest("http://localhost:3012/api/meetings/70", {
    headers: { cookie: "sb-test-auth-token=stale-but-unexpired" },
  });
}

beforeEach(() => {
  state.user = null;
  state.signInCalls = 0;
  state.signInFails = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("DEMO_USER_EMAIL", "demo@vector.test");
  vi.stubEnv("DEMO_USER_PASSWORD", "hunter2");
});

afterEach(() => vi.unstubAllEnvs());

describe("proxy updateSession", () => {
  it("lets an API request through untouched when the session is live", async () => {
    state.user = { id: "demo-user" };
    const res = await updateSession(apiRequest());
    expect(res.status).toBe(200);
    expect(state.signInCalls).toBe(0);
  });

  it("re-authenticates an API request whose session died server-side, and forwards the fresh cookie", async () => {
    // The bug: a session revoked server-side keeps an unexpired access token,
    // so a locally verified JWT looks fine here while the route handler's
    // getUser() answers 401. Checking with getUser() makes the proxy notice.
    const res = await updateSession(apiRequest());
    expect(state.signInCalls).toBe(1);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("fresh-session");
  });

  it("falls back to /login when the demo re-login fails", async () => {
    state.signInFails = true;
    const res = await updateSession(apiRequest());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
