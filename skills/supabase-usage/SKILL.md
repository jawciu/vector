---
name: supabase-usage
description: Manage Supabase for this project — auth, database connection, SQL migrations, environment setup, and the Supabase dashboard. Use when the user mentions Supabase, auth, login, sessions, cookies, RLS, or running SQL in the Supabase dashboard.
---

# Supabase Usage

## Project context

- **Supabase project**: Hosted Postgres on `aws-1-eu-west-3.pooler.supabase.com`
- **Auth method**: Email/password only (no OAuth yet)
- **Auth package**: `@supabase/ssr` (cookie-based sessions)
- **Env vars** (in `.env`, not committed):
  - `NEXT_PUBLIC_SUPABASE_URL` — project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — anon/publishable key
  - `DATABASE_URL` — transaction pooler (port 6543), used by the app at runtime
  - `DIRECT_DATABASE_URL` — session pooler (port 5432), used by Prisma Migrate

## Connection URLs

Supabase uses PgBouncer. This project needs **two connection URLs**:

| Env var | Port | Pooler mode | Used by |
|---------|------|-------------|---------|
| `DATABASE_URL` | 6543 | Transaction | App runtime (`lib/db.js`, `prisma/seed.js`) |
| `DIRECT_DATABASE_URL` | 5432 | Session | Prisma Migrate (`prisma.config.ts`) |

Transaction mode (6543) doesn't support advisory locks, so `prisma migrate dev` hangs on it. Session mode (5432) on the same pooler host supports them.

To derive one from the other: replace `:6543/` with `:5432/` (same hostname).

## Client architecture

This project uses **two Supabase clients** — never mix them.

### Browser client (`lib/supabase/client.js`)

- Use in **Client Components** only (login form, sign out, client-side auth checks)
- Async: `const supabase = await createClient()`
- Fetches env from `/api/env` if the server-injected script isn't available
- Returns `null` if env is missing — always null-check

### Server client (`lib/supabase/server.js`)

- Use in **Server Components**, **Server Actions**, and **Route Handlers**
- Async: `const supabase = await createClient()`
- Reads cookies via `next/headers` — call per-request, do not cache
- Can read/write cookies for session refresh

### Proxy (`proxy.js` → `lib/supabase/proxy.js`)

- Next.js 16 proxy pattern — runs on every request
- Calls `supabase.auth.getClaims()` to refresh the session token
- Redirects unauthenticated users to `/login` (skips `/login`, `/auth`, `/api/env`)
- **Critical**: do not add code between `createServerClient()` and `getClaims()`

## Auth flow

1. User submits email/password on `/login`
2. Browser client calls `supabase.auth.signInWithPassword()`
3. Supabase sets session cookies
4. Proxy refreshes tokens on each request via `getClaims()`
5. Sign out: `supabase.auth.signOut()` in the Sidebar dropdown → redirect to `/login`

## Running SQL against the database

If you need to run SQL outside of Prisma Migrate (e.g. one-off fixes, data backfills), use Node.js with the `pg` package:

```bash
node -e "
require('dotenv/config');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`YOUR SQL HERE\`).then(() => {
  console.log('Done');
  pool.end();
}).catch(e => { console.error(e); pool.end(); process.exit(1); });
"
```

Or use **Supabase Dashboard → SQL Editor** for interactive queries.

## Adding new env vars

1. Add to `.env` locally
2. If it needs to be public (client-side): prefix with `NEXT_PUBLIC_`
3. If deploying to Vercel: add in Vercel project settings too
4. Never commit `.env` — it's in `.gitignore`

## Common tasks

### Check if user is logged in (server)

```javascript
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
```

### Check if user is logged in (client)

```javascript
import { createClient } from "@/lib/supabase/client";
const supabase = await createClient();
if (!supabase) return; // env not available
const { data: { user } } = await supabase.auth.getUser();
```

### Add a new auth-protected route

No extra work — the proxy in `proxy.js` already redirects unauthenticated users for all routes except `/login`, `/auth`, and `/api/env`.

### Future: add OAuth provider

1. Enable the provider in Supabase Dashboard → Auth → Providers
2. Add `supabase.auth.signInWithOAuth({ provider: 'google' })` to the login page
3. The `/auth/callback` route already handles the code exchange

## Gotchas

- `getClaims()` (not `getUser()`) is used in the proxy — it validates the JWT without a network call
- The anon key is safe to expose client-side (it's rate-limited by RLS policies)
- Supabase key naming is changing: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the new format; this project accepts both via fallback
- RLS is not configured yet — tables are accessible with the anon key. Add policies before going to production
- **Direct connections (non-pooler, port 5432) don't work** on this Supabase project — always use the pooler hostname
