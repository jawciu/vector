"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Button from "@/app/ui/Button";

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
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-full max-w-[400px] rounded-xl p-8 grid gap-5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
      >
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Sign in</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Use your email and password to continue.
          </p>
        </div>

        {(error || errorParam) && (
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
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
              className="py-2 px-3 rounded-lg text-sm w-full"
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
              className="py-2 px-3 rounded-lg text-sm w-full"
              style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
            />
          </label>
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            className="w-full justify-center py-2 text-sm mt-1"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "var(--bg)", color: "var(--text-muted)" }}
        >
          <p>Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
