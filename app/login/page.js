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
      style={{
        maxWidth: 400,
        margin: "80px auto",
        padding: 24,
        display: "grid",
        gap: 16,
      }}
    >
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p style={{ fontSize: 14, color: "#6b7280" }}>
        Use your email and password. No roles or personas yet — we’ll add those
        when you’re ready.
      </p>

      {(error || errorParam) && (
        <p
          role="alert"
          style={{ fontSize: 14, color: "#b91c1c", margin: 0 }}
        >
          {error || (errorParam === "auth" && "Authentication failed.")}
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 16,
            }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 16px",
            background: "#171717",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}><p>Loading…</p></main>}>
      <LoginForm />
    </Suspense>
  );
}
