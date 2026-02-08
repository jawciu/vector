"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const errorParam = searchParams.get("error");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = await createClient();
      if (!supabase) {
        setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env");
        setLoading(false);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err?.message ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main
      className="max-w-[400px] mx-auto py-20 px-6 grid gap-4"
      style={{ background: "var(--bg)" }}
    >
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Sign in</h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Use your email and password. No roles or personas yet — we’ll add those
        when you’re ready.
      </p>

      {(error || errorParam) && (
        <p role="alert" className="text-sm m-0" style={{ color: "var(--danger)" }}>
          {error || (errorParam === "auth" && "Authentication failed.")}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="py-2.5 px-3 rounded-lg text-base w-full"
            style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="py-2.5 px-3 rounded-lg text-base w-full"
            style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="py-2.5 px-4 rounded-lg text-base font-medium transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0a0a0a", border: "none", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          className="max-w-[400px] mx-auto py-20 px-6"
          style={{ background: "var(--bg)", color: "var(--text-muted)" }}
        >
          <p>Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
