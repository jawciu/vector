# Major decisions log

All significant decisions for the Onboarding Orchestrator project. Add new entries here as we make more.

**When to update:** Whenever we make a major choice (tech, workflow, config, or "why we did it this way"), add a row (or section) here with the decision and rationale. Keep **DEFINITIONS.md** in sync when we add or change files/folders.

---

## Product & scope

| Decision | Rationale |
|----------|-----------|
| **Tailwind** — Keep Tailwind for styling. | Faster styling, good for portfolio; can mix with inline/CSS as needed. |
| **Demo clients** — Acme Co = client 1 (onboarding id `1`), TechCorp = client 2 (onboarding id `2`). | Clear mapping for list/detail and seed data. |
| **Onboardings list columns** — Company, Status, Next action, Owner, Tasks, Blocked, Last activity. Replaced earlier Stage/Priority placeholders. | Next action = first incomplete task title; Owner and Last activity from Onboarding model (`owner`, `updatedAt`). |
| **Renamed "Companies" → "Onboardings"** — Nav label, page title, action bar component, filter labels, and button all say "Onboardings" now. File renamed `CompaniesActionBar.js` → `OnboardingsActionBar.js`. | "Onboardings" better describes what the section shows (onboarding workflows per company), not just a list of companies. |
| **Onboarding schema: owner + updatedAt** — Added `owner` (String, default `""`) and `updatedAt` (DateTime, `@updatedAt`) to the Onboarding model. Migration: `20260209000000_add_owner_and_updated_at`. | Owner tracks who runs the onboarding; updatedAt powers "Last activity" column. |
| **Health scoring v2** — Onboarding health now considers: (1) 30%+ tasks blocked → "Blocked"; (2) any blocked → "At risk"; (3) 1 task overdue 7+ days or 3+ tasks overdue → "At risk"; (4) velocity: remaining tasks / completion rate > days to go-live → "At risk". Returns `{ status, reasons }` with human-readable reasons shown as tooltip on the health pill. Added `createdAt` to Onboarding model for velocity calculation. | Previous logic only used blocked count (all blocked → Blocked, any blocked → At risk). New thresholds are more realistic and surface real project risk earlier. Tooltip gives instant context without cluttering the UI. |
| **Demo seed — 10 companies** — Seed script creates 10 companies with a mix of Active (5), Completed (3), Paused (2) onboardings plus 28 tasks across all of them. | Enough data to exercise all badge states and filter views. |

---

## Database & backend

| Decision | Rationale |
|----------|-----------|
| **Read DB** — Postgres + Prisma. App reads from DB only for now (no create/update/delete from UI yet). | MVP: list and detail work; CRUD and auth come next. See `DATABASE_SETUP.md`. |
| **Supabase for Postgres** — Use Supabase as the Postgres host for this portfolio project. | Beginner-friendly, no local DB, free tier; Supabase Auth (magic link, OAuth) fits when we add vendor auth. |
| **Schema changes** — First tables (Company, Onboarding, Task) created manually in Supabase via `prisma/supabase-create-tables.sql`. | Prisma 7 `db push` doesn't apply in this setup. |
| **Future schema changes** — Use **Prisma Migrate**: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name descriptive_name`. Should work automatically now that `DIRECT_DATABASE_URL` (session pooler, port 5432) is configured. | Keeps schema and DB in sync without manual SQL for every change. |
| **Two DB URLs** — `DATABASE_URL` (transaction pooler, port 6543) for the app; `DIRECT_DATABASE_URL` (session pooler, port 5432) for Prisma Migrate. `prisma.config.ts` uses `DIRECT_DATABASE_URL` with fallback. | Transaction pooler uses PgBouncer which doesn't support advisory locks needed by Prisma Migrate; session pooler (same host, port 5432) does. |
| **Baseline migration** — `prisma/migrations/20260201180000_init` exists and is marked as applied so Prisma knows current state. | Migrate only generates *new* changes from here on. |
| **Prisma 7 — connection** — Use **`@prisma/adapter-pg`** and pass **`DATABASE_URL`** from `.env` when creating `PrismaClient` (in `lib/db.js` and `prisma/seed.js`). | Prisma 7 requires an adapter or Accelerate URL when running outside the CLI; no default URL from schema. |
| **Prisma config** — Use **`env("DATABASE_URL")`** from `prisma/config` in `prisma.config.ts` (not `process.env["DATABASE_URL"]`). | Prisma 7 CLI expects the URL via `env()` in config. |
| **Seed** — Run with **`npm run seed`** (runs `npx tsx prisma/seed.js`). Load `.env` with **`dotenv/config`** in the seed script. | Seed runs outside CLI so it needs its own env load and tsx to load the generated TS client. |

---

## Auth

| Decision | Rationale |
|----------|-----------|
| **Supabase Auth (email/password only)** — Sign up, sign in, sign out, session via Supabase. No OAuth for now. | Matches "vendor" use case; can add magic link or OAuth later. |
| **No roles or seeded personas yet** — No role-based views or seed users. | Caroline will define vendor vs customer roles and what each view shows later; auth is in place so we can add roles when ready. |
| **Session refresh** — Use Next.js 16 **proxy** (`proxy.js` at root) to call `supabase.auth.getClaims()`, refresh tokens, and redirect unauthenticated users to `/login`. | Supabase SSR pattern: proxy is the only place that can write cookies for the session; getClaims() validates the JWT. |
| **Supabase client split** — **Browser client** (`lib/supabase/client.js`) for Client Components (login form, sign out). **Server client** (`lib/supabase/server.js`) for Server Components and Route Handlers. | Per Supabase Next.js guide; server client uses `cookies()` from `next/headers`. |
| **Sign out in user dropdown** — Sign out moved from a dedicated nav button to the sidebar user block: click user name → dropdown → "Sign out". | Cleaner nav; sign out is a user action, not a primary nav item. |
| **Env for Auth** — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) in `.env`; same Supabase project as DB. | Anon key from Project Settings → API; needed for auth and cookie-based session. |

---

## Next.js & build

| Decision | Rationale |
|----------|-----------|
| **PostCSS config** — Use **`postcss.config.js`** (CommonJS with `module.exports`), not `postcss.config.mjs`. | Turbopack wasn't loading the ESM config; CommonJS works. |
| **Dev and build** — Use **`next dev --webpack`** and **`next build --webpack`** in `package.json` scripts. | Avoids Turbopack PostCSS "error evaluating node" in the browser; Webpack handles PostCSS correctly. |
| **Dynamic route params** — In `app/onboardings/[id]/page.js`, **await `params`** before reading `id`: `const { id } = await params`. | Next.js 15+ passes `params` as a Promise; using `params?.id` without await gave `undefined` and "Onboarding not found". |
| **DB helpers and invalid ids** — In `lib/db.js`, **validate `id` / `onboardingId`** before calling Prisma: if `Number(id)` is `NaN`, return `null` or `[]` instead of calling Prisma. | Passing `NaN` to Prisma (e.g. from undefined during nav/hot reload) caused `PrismaClientValidationError`. |
| **Onboarding detail layout — Kanban** — The company onboarding detail page (`/onboardings/[id]`) now shows tasks in a Kanban-style board with one column per status (Todo, In progress, Blocked, Done) instead of a single filtered list. | Makes it easier to scan workload by status at a glance and feels closer to real-world onboarding boards vendors are used to. |

---

## Docs & structure

| Decision | Rationale |
|----------|-----------|
| **PLAN.md** — Product/MVP plan, scope, tech stack, key decisions summary. | Single place for "what we're building" and high-level choices. |
| **DATABASE_SETUP.md** — How to set up Postgres (Supabase), create tables (manual SQL first time), seed, and use migrations. | Onboarding and reference for DB setup. |
| **DEFINITIONS.md** — What each file/folder is for and what you can do from it. | Project map for navigation and edits. |
| **DECISIONS.md** — This file: log of major decisions with rationale. | Trace why things are set up the way they are; update when we make new choices. |

---

## Agent skills

| Decision | Rationale |
|----------|-----------|
| **GitHub usage skill** — `.cursor/skills/github-usage/SKILL.md`: teaches the agent how to commit, push, create repos, manage settings, and handle auth via `gh` CLI for this project. | Follows the open Agent Skills format (agentskills.io); captures project-specific GitHub context (account, repo, permissions) so the agent doesn't have to rediscover it each session. |
| **Supabase usage skill** — `.cursor/skills/supabase-usage/SKILL.md`: auth flow, client architecture (browser vs server vs proxy), running SQL manually, env vars, and common tasks. | Agent can handle Supabase auth, session, and migration tasks without re-reading all the source files each time. |
| **Prisma usage skill** — `.cursor/skills/prisma-usage/SKILL.md`: schema changes, migration workflow (including manual fallback when CLI can't connect), seeding, client generation, query patterns. | Agent can run the full schema-change workflow autonomously, including the Supabase SQL Editor fallback. |

---

*Add new rows under the right section (or a new section) when we make more major decisions.*
