import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;
interface SupabaseEnv {
  url: string;
  key: string;
}

declare global {
  interface Window {
    __SUPABASE_ENV__?: Partial<SupabaseEnv>;
  }
}

let cachedClient: SupabaseBrowserClient | null = null;
let envPromise: Promise<SupabaseEnv> | null = null;

async function getEnv(): Promise<Partial<SupabaseEnv>> {
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
export async function createClient(): Promise<SupabaseBrowserClient | null> {
  if (cachedClient) return cachedClient;
  const env = await getEnv();
  if (!env?.url || !env?.key) return null;
  cachedClient = createBrowserClient(env.url, env.key);
  return cachedClient;
}
