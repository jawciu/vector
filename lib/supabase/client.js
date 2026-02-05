import { createBrowserClient } from "@supabase/ssr";

let cachedClient = null;
let envPromise = null;

async function getEnv() {
  if (typeof window !== "undefined" && window.__SUPABASE_ENV__?.url && window.__SUPABASE_ENV__?.key) {
    return window.__SUPABASE_ENV__;
  }
  if (!envPromise) {
    envPromise = fetch("/api/env")
      .then((r) => r.json())
      .catch(() => ({ url: "", key: "" }));
  }
  return envPromise;
}

/**
 * Supabase client for Client Components (browser). Async so we can fetch
 * env from /api/env when the server-injected script isn't available.
 */
export async function createClient() {
  if (cachedClient) return cachedClient;
  const env = await getEnv();
  if (!env?.url || !env?.key) return null;
  cachedClient = createBrowserClient(env.url, env.key);
  return cachedClient;
}
