import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth session and redirects unauthenticated users to /login.
 * Used by the root proxy (Next.js 16). Do not run code between createServerClient
 * and getClaims() — token refresh depends on it.
 */
export async function updateSession(request) {
  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/env") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/portal") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/integrations/");

  try {
    let supabaseResponse = NextResponse.next({ request });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      if (!isAuthRoute) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        return NextResponse.redirect(loginUrl);
      }
      return supabaseResponse;
    }

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data } = await supabase.auth.getClaims();
    const user = data?.claims;

    if (!user && !isAuthRoute) {
      // Public demo: sign anonymous visitors into the shared demo account instead
      // of bouncing them to /login, so the portfolio link is click-and-explore.
      // Enabled only when both DEMO_USER_* vars are set (they are absent in any
      // environment that should stay private). /login still serves the real form.
      const demoEmail = process.env.DEMO_USER_EMAIL;
      const demoPassword = process.env.DEMO_USER_PASSWORD;
      if (demoEmail && demoPassword) {
        const { error } = await supabase.auth.signInWithPassword({
          email: demoEmail,
          password: demoPassword,
        });
        // On success the setAll cookie handler above has rebuilt supabaseResponse
        // with the new session cookies; let the request through.
        if (!error) return supabaseResponse;
        console.error("[proxy] demo auto-login failed:", error.message);
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  } catch {
    if (!isAuthRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }
}
