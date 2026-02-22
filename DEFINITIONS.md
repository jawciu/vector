# Project definitions — what each file/folder is for

Quick reference for what you can do from each part of the Onboarding Orchestrator project.

**When to update:** When we add, remove, or change the role of files or folders, update the relevant section here so the project map stays accurate. Keep **DECISIONS.md** in sync when we make major decisions.

---

## Root

| File / folder | What it's for |
|---------------|----------------|
| **`app/`** | Next.js App Router: all pages, layout, and UI components. |
| **`lib/`** | Shared logic: database access (Prisma), helpers (e.g. health). |
| **`prisma/`** | Database: schema, seed script, migrations, and manual SQL for Supabase. |
| **`public/`** | Static assets (images, favicons, etc.) served at `/`. |
| **`package.json`** | Dependencies and scripts: `npm run dev`, `npm run build`, `npm run seed`, etc. |
| **`next.config.mjs`** | Next.js config (default for now). |
| **`proxy.js`** | Next.js 16 proxy: runs on each request to refresh Supabase auth session and redirect unauthenticated users to `/login`. Calls `lib/supabase/proxy.js`. |
| **`postcss.config.js`** | PostCSS config: Tailwind via `@tailwindcss/postcss`. |
| **`prisma.config.ts`** | Prisma 7 config: schema path, migrations path, seed command, `DATABASE_URL`. |
| **`jsconfig.json`** | JS project config: path alias `@/*` → project root. |
| **`eslint.config.mjs`** | ESLint rules. |
| **`.env`** | Local env vars (not committed). `DATABASE_URL` for Postgres; `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Supabase Auth (same project as DB). |
| **`.gitignore`** | Files/folders Git ignores. |
| **`PLAN.md`** | Product/MVP plan and key decisions. |
| **`DATABASE_SETUP.md`** | How to set up Postgres (Supabase), create tables, seed, and use migrations. |
| **`DEFINITIONS.md`** | This file: what each file/folder is for. |
| **`DECISIONS.md`** | Log of major decisions and rationale; update when we make new choices. |

---

## `app/` — pages and UI

| File / folder | What it's for |
|---------------|----------------|
| **`app/layout.js`** | Root layout: wraps every page (HTML, body, fonts, global CSS). Edit here to change site-wide structure or metadata. |
| **`app/page.js`** | Home page (`/`): Onboardings list — title, border, action bar, table with Company, Status, Next action, Owner, Tasks, Blocked, Last activity. Server Component; fetches from DB. |
| **`app/globals.css`** | Global styles and Tailwind (`@import "tailwindcss"`). |
| **`app/page.module.css`** | Unused for now; you can use it for page-specific styles or delete. |
| **`app/favicon.ico`** | Browser tab icon. |
| **`app/components/`** | Reusable UI pieces used by pages. |
| **`app/components/StatusBadge.js`** | Renders a status pill (Todo, In progress, Blocked, Done) with colors. |
| **`app/components/TaskCard.js`** | Renders one task row: title, waiting on, status badge, due date. |
| **`app/components/AppShell.js`** | Client wrapper: layout with sidebar on app routes; no shell on `/login`. |
| **`app/components/Sidebar.js`** | Sidebar: nav links (Onboardings, Settings), user block at top with dropdown (Sign out). |
| **`app/components/SignOut.js`** | Unused: standalone "Sign out" button component; sign out is in Sidebar user dropdown. |
| **`app/components/OnboardingsActionBar.js`** | Client component: action bar on Onboardings page — "All Onboardings" dropdown filter, same border style as sidebar. Uses shared menu primitives from `Menu.js`. |
| **`app/components/Menu.js`** | Reusable menu primitives: `MenuTriggerButton`, `MenuList`, and `MenuOption` with shared dropdown styles used for filters and other listbox-style menus. |
| **`app/login/page.js`** | Login page: email/password form; Supabase `signInWithPassword`; redirect to `/` on success. |
| **`app/auth/callback/route.js`** | GET route: exchanges Supabase auth code for session (e.g. email confirmation); redirects to `/` or `?next=`. |
| **`app/onboardings/[id]/`** | Dynamic route: one onboarding by id (e.g. `/onboardings/1`, `/onboardings/2`). |
| **`app/onboardings/[id]/page.js`** | Server Component: loads onboarding + tasks by id, then renders detail client or "not found". |
| **`app/onboardings/[id]/OnboardingDetailClient.js`** | Client Component: company header, health, and Kanban board showing tasks in columns by status (Todo, In progress, Blocked, Done). Uses the data passed from `page.js`. |

**What you can do:** Add new pages under `app/` (e.g. `app/about/page.js` → `/about`). Add components in `app/components/` and import them where needed. Change layout or global styles in `layout.js` and `globals.css`.

---

## `lib/` — shared logic

| File / folder | What it's for |
|---------------|----------------|
| **`lib/db.js`** | Database read layer: Prisma client + helpers. Use **`getOnboardings()`**, **`getOnboarding(id)`**, **`getTasksForOnboarding(id)`**, **`STATUSES`** from Server Components or API routes. |
| **`lib/health.js`** | Pure helper: **`computeHealth(tasks, { targetGoLive, createdAt })`** → `{ status, reasons }`. Status is `"Blocked"` / `"At risk"` / `"On track"`. Reasons is a string array for tooltips. No DB; safe to use in client components. |
| **`lib/supabase/client.js`** | **`createClient()`** for browser: use in Client Components (login form, sign out). |
| **`lib/supabase/server.js`** | **`createClient()`** for server: use in Server Components, Server Actions, Route Handlers; uses `cookies()` from `next/headers`. |
| **`lib/supabase/proxy.js`** | **`updateSession(request)`**: creates Supabase server client from request cookies, calls `getClaims()` to refresh session, redirects to `/login` if no user. Used by root `proxy.js`. |
| **`lib/generated/prisma/`** | Generated Prisma client (from `prisma/schema.prisma`). Don't edit; regenerate with `npx prisma generate` after schema changes. |

**What you can do:** Add new DB helpers in `lib/db.js`. Add small pure helpers in `lib/` (e.g. formatters, validators). When you add CRUD, you'll add write functions in `lib/db.js` or in API routes.

---

## `prisma/` — database

| File / folder | What it's for |
|---------------|----------------|
| **`prisma/schema.prisma`** | Data model: **Company**, **Onboarding** (with `owner`, `updatedAt`), **Task**. Edit here when you add tables or columns; then create a migration or run manual SQL. |
| **`prisma/seed.js`** | Seed script: fills DB with demo data (Acme Co, TechCorp, tasks). Run with **`npm run seed`**. |
| **`prisma/supabase-create-tables.sql`** | SQL to create the three tables in Supabase (used when `db push` doesn't apply). Run in Supabase SQL Editor for first-time setup. |
| **`prisma/migrations/`** | Migration history. Each folder = one migration (e.g. `20260201180000_init`, `20260209000000_add_owner_and_updated_at`). Use **`npx prisma migrate dev --name <name>`** to add a new migration after schema changes. |

**What you can do:** Change the data model in `schema.prisma`, then run `npx prisma migrate dev --name descriptive_name` (or `--create-only` and run the SQL in Supabase if the CLI can't connect). Change demo data by editing `seed.js` and running `npm run seed`.

---

## `public/`

| File / folder | What it's for |
|---------------|----------------|
| **`public/*`** | Static files. Put images, PDFs, etc. here; they're served at `/filename` (e.g. `public/logo.png` → `/logo.png`). |

---

## Config and scripts (quick ref)

| Item | What you do with it |
|------|----------------------|
| **`npm run dev`** | Start dev server (Webpack). |
| **`npm run build`** | Production build. |
| **`npm run start`** | Run production server after `build`. |
| **`npm run seed`** | Run seed script (reset + insert demo data). |
| **`npx prisma generate`** | Regenerate Prisma client after editing `schema.prisma`. |
| **`npx prisma migrate dev --name <name>`** | Create and apply a new migration. |
| **`npx prisma migrate dev --name <name> --create-only`** | Only create migration file; you run the SQL yourself (e.g. in Supabase). |

---

## `.cursor/skills/` — agent skills

| File / folder | What it's for |
|---------------|----------------|
| **`.cursor/skills/github-usage/SKILL.md`** | Agent skill: GitHub operations — committing, pushing, creating repos, managing settings, auth troubleshooting via `gh` CLI. Follows the Agent Skills format (agentskills.io). |
| **`.cursor/skills/supabase-usage/SKILL.md`** | Agent skill: Supabase auth flow, client architecture (browser/server/proxy), running SQL in dashboard, env setup, common auth tasks. |
| **`.cursor/skills/prisma-usage/SKILL.md`** | Agent skill: Prisma 7 schema changes, migration workflow (auto + manual fallback), seeding, client generation, query patterns. |
| **`.cursor/skills/figma-usage/SKILL.md`** | Agent skill: Figma MCP server — fetching design context, icons, assets, screenshots, and design tokens from Figma via the remote MCP server. |

---

If you add new features (e.g. vendor auth, CRUD, API routes), you'll add files under `app/`, `lib/`, or `app/api/`; you can extend this doc as you go.
