---
name: prisma-usage
description: Manage Prisma ORM for this project — schema changes, migrations, seeding, client generation, and database queries. Use when the user mentions Prisma, database schema, migrations, seeding, models, or database queries.
---

# Prisma Usage

## Project context

- **Prisma version**: 7.x (with `@prisma/adapter-pg`)
- **Database**: PostgreSQL on Supabase
- **Schema**: `prisma/schema.prisma`
- **Config**: `prisma.config.ts` (defines schema path, migrations, seed command, DB URL)
- **Generated client**: `lib/generated/prisma/` — import from `lib/generated/prisma/client`
- **DB access layer**: `lib/db.js` — all queries go through here
- **Seed script**: `prisma/seed.js` (runs via `npm run seed`)

## Current schema

Eight models with relations:

- **Company** → has many Onboardings
- **Onboarding** → belongs to Company, has many Tasks, Contacts, Phases, MagicLinks, Files. Fields: `owner`, `status` (Active | Completed | Paused | Archived), `targetGoLive` (DateTime?), `createdAt`, `updatedAt`
- **Contact** → belongs to Onboarding, has many MagicLinks, assigned Tasks, Files. Fields: `name`, `email`, `role`
- **Phase** → belongs to Onboarding, has many Tasks. Fields: `name`, `sortOrder`, `targetDate` (DateTime?), `isComplete` (Boolean)
- **Task** → belongs to Onboarding + Phase, optional assigneeContact, self-referential blockedByTask, has many Comments, Files. Fields: `title`, `description`, `status` (Not started | In progress | Under investigation | Blocked | Done), `due`, `owner`, `members` (String[]), `notes`, `sortOrder`, `priority` (low | medium | high), `commentCount`, `previousStatus`
- **Comment** → belongs to Task. Fields: `author`, `body`, `createdAt`
- **MagicLink** → belongs to Contact + Onboarding. Fields: `token` (unique UUID), `expiresAt`, `revokedAt`, `lastUsedAt`, `createdAt`
- **File** → belongs to Task + Onboarding, optional Contact. Fields: `uploadedBy`, `fileName`, `fileSize`, `mimeType`, `storagePath`, `createdAt`

## Connection URLs

Two env vars in `.env`:

- **`DATABASE_URL`** — Supabase **transaction pooler** (port `6543`). Used by the app at runtime (`lib/db.js`, `prisma/seed.js`).
- **`DIRECT_DATABASE_URL`** — Supabase **session pooler** (port `5432`). Used by Prisma Migrate in `prisma.config.ts`. Session mode supports advisory locks that migrations need.

`prisma.config.ts` uses `DIRECT_DATABASE_URL` with fallback:

```typescript
datasource: {
  url: env("DIRECT_DATABASE_URL") ?? env("DATABASE_URL"),
}
```

**Why two URLs?** The default pooler (port 6543) uses PgBouncer in transaction mode, which doesn't support advisory locks. Prisma Migrate hangs indefinitely on it. Port 5432 on the same pooler hostname uses session mode, which works.

**Deriving one from the other**: session URL = transaction URL with `:6543/` replaced by `:5432/`.

## Prisma 7 specifics

1. **No `url` in schema datasource** — the connection URL is in `prisma.config.ts` (for CLI) and `process.env.DATABASE_URL` at runtime
2. **Adapter required** — `PrismaClient` needs `@prisma/adapter-pg`:
   ```javascript
   import { PrismaPg } from "@prisma/adapter-pg";
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   const prisma = new PrismaClient({ adapter });
   ```
3. **Generator output** — set to `../lib/generated/prisma` (not the default `node_modules`)
4. **Seed uses tsx** — `npx tsx prisma/seed.js` because the generated client is TypeScript

## Schema changes workflow

### Step 1: Edit schema

Edit `prisma/schema.prisma`. Example — adding a field:

```prisma
model Onboarding {
  id        Int      @id @default(autoincrement())
  companyId Int
  owner     String   @default("")
  updatedAt DateTime @default(now()) @updatedAt
  status    String   @default("active")  // new field
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  tasks     Task[]
}
```

### Step 2: Create and apply migration

This should work automatically now that `DIRECT_DATABASE_URL` is set:

```bash
npx prisma migrate dev --name descriptive-name
```

**If the CLI still hangs** (e.g. network issue), use the manual fallback:

1. Create the migration directory:
   ```bash
   mkdir -p prisma/migrations/YYYYMMDDHHMMSS_descriptive_name
   ```
2. Write the SQL file (`migration.sql` in that directory)
3. Apply the SQL using Node.js and `pg`:
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
4. Mark as applied:
   ```bash
   npx prisma migrate resolve --applied YYYYMMDDHHMMSS_descriptive_name
   ```

### Step 3: Regenerate client

```bash
npx prisma generate
```

Always run after schema changes. Updates `lib/generated/prisma/`.

### Step 4: Update code

- Add the new field to queries in `lib/db.js`
- Update seed data in `prisma/seed.js` if needed
- Update page components to display the new data

## Existing migrations

| Migration | What it did |
|-----------|-------------|
| `20260201180000_init` | Baseline — Company, Onboarding, Task tables |
| `20260209000000_add_owner_and_updated_at` | Added `owner` and `updatedAt` to Onboarding |
| `20260209190000_add_onboarding_status` | Added `status` field to Onboarding |
| `20260215000000_add_target_go_live` | Added `targetGoLive` (DateTime?) to Onboarding |
| `20260215100000_add_contact_model` | Added Contact model |
| `20260215200000_add_phases` | Added Phase model + `phaseId` on Task |
| `20260218000000_enable_rls` | Enabled RLS on all public tables |
| `20260221000000_add_task_new_fields` | Added priority, commentCount, previousStatus, blockedByTaskId, assigneeContactId to Task |
| `20260221050000_add_task_description_owner_members_notes` | Added description, owner, members, notes to Task |
| `20260221100000_add_task_sort_order` | Added sortOrder to Task |
| `20260222190000_add_onboarding_created_at` | Added `createdAt` to Onboarding |
| `20260310000000_add_portal_models` | Added MagicLink and File models for customer portal |

## Adding queries

All DB access goes through `lib/db.js`. Follow the existing pattern:

```javascript
export async function getCompany(id) {
  const numId = Number(id);
  if (Number.isNaN(numId)) return null;  // always validate
  const company = await prisma.company.findUnique({
    where: { id: numId },
    include: { onboardings: true },
  });
  if (!company) return null;
  return {
    id: String(company.id),
    name: company.name,
    onboardingCount: company.onboardings.length,
  };
}
```

Key patterns:
- Validate numeric IDs before querying (avoid `NaN` → `PrismaClientValidationError`)
- Return plain objects (not Prisma models) — stringify IDs
- Use `include` for relations

## Dynamic schema check

To verify the schema is valid before making changes, the skill can preprocess:

<!-- When loading this skill, validate schema state -->
<!-- Run: npx prisma validate 2>&1 | head -3 -->

If validation fails, fix the schema before proceeding with migrations.

## Seeding

```bash
npm run seed
```

The seed script (`prisma/seed.js`):
1. Deletes all data (cascading from Company down)
2. Creates 10 companies with onboardings
3. Creates phases, tasks (28 total), contacts
4. Creates sample comments

To add new seed data, edit `prisma/seed.js` and re-run `npm run seed`.

**Important**: The seed script loads `.env` with `import "dotenv/config"` at the top — it runs outside the Next.js runtime so env vars aren't automatic.

## Common commands

| Command | What it does |
|---------|-------------|
| `npx prisma generate` | Regenerate client after schema changes |
| `npx prisma migrate dev --name <name>` | Create + apply migration (uses `DIRECT_DATABASE_URL`) |
| `npx prisma migrate status` | Check if DB is in sync with migrations |
| `npx prisma migrate resolve --applied <name>` | Mark a migration as applied (after running SQL manually) |
| `npm run seed` | Reset + seed demo data |
| `npx prisma studio` | Open visual DB browser |

## Gotchas

- **Two connection URLs required**: `DATABASE_URL` (port 6543, transaction pooler) for the app; `DIRECT_DATABASE_URL` (port 5432, session pooler) for Prisma Migrate. Without the session URL, `prisma migrate dev` hangs indefinitely.
- **`prisma db push` doesn't work** reliably in this Prisma 7 + Supabase setup — use migrations instead
- **Singleton pattern in `lib/db.js`**: `globalForPrisma` prevents creating multiple clients during Next.js hot reload in dev
- **Cascade deletes**: all relations use `onDelete: Cascade` — deleting a Company deletes its Onboardings and Tasks
- **All DB access in `lib/db.js`** — ~25 functions covering reads and writes. Always add new queries here, never call Prisma directly from routes or components
