# Postgres + Prisma setup

The app reads onboarding and task data from **Postgres** via **Prisma**. No code changes needed — just pick where your Postgres runs and set `DATABASE_URL`.

## Recommended: Supabase (beginner-friendly, OAuth later)

**Supabase** is hosted Postgres with a dashboard and free tier. Good for portfolio projects and when you add vendor auth later (Supabase Auth supports magic links and OAuth — Google, GitHub, etc.).

1. Go to [supabase.com](https://supabase.com) → create a project (free tier).
2. In the dashboard: **Project Settings → Database** → copy the **Connection string** (URI). Use the **Transaction** or **Session** pooler if you deploy to serverless (e.g. Vercel).
3. Put it in `.env` as `DATABASE_URL`. Example shape:
   ```txt
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]` with the DB password you set when creating the project.

Then run **step 3** below (push schema + seed).

## Other options

- **Local**: Install Postgres (e.g. [Postgres.app](https://postgresapp.com/) on Mac, or Docker) and use `postgresql://postgres:password@localhost:5432/onboarding`.
- **Neon**: [neon.tech](https://neon.tech) — free tier, copy connection URL from dashboard.

## 2. Connect the app

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set `DATABASE_URL` to your Postgres connection string (Supabase, local, or Neon).

## 3. Create tables and seed data

**First-time setup (Supabase):** `npx prisma db push` often does nothing with Prisma 7 + Supabase in this setup. Create tables manually:

1. In **Supabase** → **SQL Editor** → **New query**, paste and run the SQL from **`prisma/supabase-create-tables.sql`** (creates Company, Onboarding, Task).
2. From the project root run: **`npm run seed`** (seeds Acme Co + TechCorp and their tasks).

After this, `npm run dev` will read from Postgres. List page (`/`) and detail pages (`/onboardings/1`, `/onboardings/2`) use the seeded data.

**Future schema changes (new columns, tables):** Use Prisma Migrate so you don’t have to write SQL by hand:

1. Edit **`prisma/schema.prisma`** (add a column, table, etc.).
2. Run: **`npx prisma migrate dev --name descriptive_name`** (e.g. `add_contact_email`).
   - Prisma creates a migration file under `prisma/migrations/` and applies it to the DB.
3. If the CLI fails to connect (e.g. TLS error), generate the migration only: **`npx prisma migrate dev --name descriptive_name --create-only`**, then open the new `prisma/migrations/.../migration.sql` file, copy its contents, and run that SQL in **Supabase → SQL Editor**. Then run **`npx prisma migrate resolve --applied <migration_folder_name>`** so Prisma marks it as applied.

A baseline migration (`prisma/migrations/20260201180000_init`) is in place so Prisma knows the current schema; you only add new migrations when you change the schema.

## 4. Useful commands

| Command | What it does |
|--------|------------------|
| `npx prisma generate` | Regenerate the Prisma client (e.g. after changing `prisma/schema.prisma`). |
| `npx prisma db push` | Sync schema to the DB (no migration files). Good for early dev. |
| `npx prisma db seed` | Run the seed script (resets and inserts demo data). |
| `npx prisma studio` | Open Prisma Studio in the browser to view/edit data. |

## 5. Prisma 7 notes

- **Connection URL**: Not in `prisma/schema.prisma` anymore. It’s in `prisma.config.ts` for CLI (migrate, push, seed) and in `process.env.DATABASE_URL` at runtime for the app (see `lib/db.js`).
- **Generated client**: Lives in `lib/generated/prisma/` (TypeScript). The app imports from `lib/generated/prisma/client`.
- **Seed**: Runs with `node --import=tsx prisma/seed.js` so it can load the generated TS client.
