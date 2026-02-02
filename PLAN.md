# Onboarding Orchestrator — MVP Plan

Portfolio-strong B2B onboarding workflow tool. Lightweight MVP, not full enterprise.

*Caroline calls the AI assistant "Cakes".*

## Product

- **Vendor view**: Track onboarding tasks (owners, due dates, status, “waiting on”, blockers).
- **Customer view**: Simple page so customers see what’s next (no account).
- **AI (optional)**: Generate polite follow-up drafts for blocked tasks; human copies/sends.

## Target story

Startup buying tools / vendor onboarding (procurement + setup + rollout). Validate with interviews (e.g. Lightdash procurement experience, backend lead).

## MVP scope (4–6 weeks)

### Core (Weeks 1–4)

1. Database + basic pages: onboardings list + onboarding detail (done in scaffolding).
2. CRUD tasks: create/edit/delete, status, due date, owner, “waiting on”.
3. Vendor auth + protected pages (only logged-in vendor can edit).
4. Health rules + polish + seeded demo data.  
   Health = “At risk” if any blocked or overdue; else “On track”. Show reasons on dashboard.

### Weeks 5–6 (optional)

5. Customer magic-link page (no login) + file upload for tasks. Token per contact, expiry + revocation.
6. One “wow” add-on: **AI follow-up draft** for blocked tasks (human approves/copies).  
   Drag-and-drop Kanban only after core works.

## Tech stack

- Next.js (App Router), JavaScript (no TypeScript for now).
- **Tailwind** — we’re using it for styling (keep).
- **Postgres** — read DB for onboardings and tasks. **Supabase** recommended (hosted Postgres, free tier, dashboard; Supabase Auth for OAuth later).
- **Prisma** — ORM; schema in `prisma/schema.prisma`, client in `lib/generated/prisma`, app layer in `lib/db.js`.
- ESLint enabled. Defer CRM; later: “CRM link” field or CSV import if needed.

## Key decisions (log)

*Full log with rationale: **`DECISIONS.md`**.*

- **Tailwind**: Keep Tailwind for styling.
- **Demo clients**: Acme Co = client 1 (onboarding id `1`), TechCorp = client 2 (onboarding id `2`).
- **Read DB**: Postgres + Prisma. App reads from DB only for now (no create/update/delete from UI yet). See `DATABASE_SETUP.md` for setup.
- **Supabase for Postgres**: Use Supabase as the Postgres host for this portfolio project — beginner-friendly, no local DB, free tier; when we add vendor auth later, Supabase Auth (magic link, OAuth) fits well.
- **Schema changes**: First tables (Company, Onboarding, Task) were created manually in Supabase (Prisma 7 `db push` doesn’t apply in this setup). For future changes: use **Prisma Migrate** — edit `prisma/schema.prisma`, run `npx prisma migrate dev --name descriptive_name`; if CLI can’t connect, use `--create-only` and run the generated SQL in Supabase SQL Editor. Baseline migration `20260201180000_init` is in place.

## Entities (for backend)

- **Company** (customer)
- **Onboarding** (per company)
- **Contact** (customer person: IT admin, Ops lead, etc.)
- **Task**: title, status, due date, owner, waitingOn, notes, attachments  
  Optional later: task dependency (“blocked by”).

## AI feature (if built)

Button on blocked task: “Generate follow-up” → draft email/Slack using title, due date, who it’s waiting on, what’s needed. Human copies/sends. No auto-send.

## Current scaffolding

- **`/`** — List of onboardings (company name, health, task count). Links to detail. Data from Postgres via `lib/db.js`.
- **`/onboardings/[id]`** — One onboarding: task list, health, status filter. Data from Postgres.
- **`lib/db.js`** — Postgres read layer (Prisma): `getOnboardings`, `getOnboarding`, `getTasksForOnboarding`. `lib/health.js` has `computeHealth` (pure, no DB).
- **`prisma/schema.prisma`** — Models: Company, Onboarding, Task. Connection URL in `prisma.config.ts` (CLI) and `DATABASE_URL` at runtime.
- **`prisma/seed.js`** — Seeds Acme Co + TechCorp and their tasks. Run with `npx prisma db seed`.
- **`app/components/`** — StatusBadge, TaskCard (reused on detail page).
- **`DATABASE_SETUP.md`** — How to set up Postgres and run push/seed.
