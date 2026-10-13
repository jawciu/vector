# 20261013120000_add_task_dependency: runbook

Adds the `TaskDependency` table (a task waits on another task, or on a text label for a
blocker that is not a task) and backfills one row per existing `Task.blockedByTaskId`.
Additive only: `Task.blockedByTaskId` stays, and the app keeps it equal to each task's first
task blocker until a later migration retires it (add-then-tighten).

**Order matters:** apply this migration to the live database BEFORE the code that reads
`TaskDependency` is deployed or merged. The app, `scripts/demo-snapshot.js` and
`scripts/demo-date-shift.mjs` (nightly) all query the new table.

`prisma migrate dev` cannot be used (the Supabase shadow database cannot replay the `auth`
schema, P3006), so the SQL is applied by hand.

## 1. Dry run on a copy (no live writes)

On a local copy of the live data (`/Users/caro/Code/onboarding-ts-eval/localdb`, database
cloned from `vector_snapshot`):

```bash
node /Users/caro/Code/onboarding-ts-eval/feat2/dry-run.cjs <local db> prisma/migrations/20261013120000_add_task_dependency/migration.sql
```

It runs the SQL inside `BEGIN ... ROLLBACK`, checks that the backfilled row count equals the
number of tasks with a `blockedByTaskId` (and that every pair matches), probes each constraint,
and confirms the table is gone after the rollback. Transcript of the rehearsal:
`/Users/caro/Code/onboarding-ts-eval/feat2/migration-dry-run.txt` (419 tasks, 115 with a
blocker, 115 rows backfilled, 0 missing, 0 self-blocked, 0 dangling).

The same rolled-back check can be run against live with Caroline's go-ahead (read-only in
effect: it ends in ROLLBACK). Read its output before going further.

## 2. Apply (live: only with Caroline's explicit go-ahead)

Prisma 7.4's `db execute` has **no `--url` flag** (it prints its help, does nothing and exits,
and a following `migrate resolve` would then mark an unapplied migration as applied; this
happened in the rehearsal and was caught). The URL comes from `prisma.config.ts`, which reads
`DIRECT_DATABASE_URL`. So:

```bash
set -euo pipefail
# DIRECT_DATABASE_URL must be the session pooler (port 5432) of the target database.
npx prisma migrate status                      # expect: 20261013120000_add_task_dependency not yet applied
npx prisma db execute --file prisma/migrations/20261013120000_add_task_dependency/migration.sql
# Verify BEFORE resolving: the table exists and the backfill matches.
#   select (select count(*) from "TaskDependency") as rows,
#          (select count(*) from "Task" where "blockedByTaskId" is not null and "blockedByTaskId" <> id) as expected;
npx prisma migrate resolve --applied 20261013120000_add_task_dependency
npx prisma migrate status                      # expect: Database schema is up to date
```

Do not pipe these commands through `tail`/`head` (that hides a failing exit code).

## 3. After applying

- Re-capture the demo snapshot (`npx tsx scripts/demo-snapshot.js --capture`) so it carries
  `dependencies`. Until then the old snapshot still works: a task without the field means
  "exactly its single blocker".
- `prisma migrate diff` will report the partial unique index
  `TaskDependency_taskId_blockedByTaskId_key` and the CHECK constraints as drift. They are
  intentional and not expressible in `schema.prisma` (same as the Task CHECKs).

## Rollback

Nothing reads the table before the new code ships, so rolling back is
`DROP TABLE "TaskDependency";` plus deleting the `_prisma_migrations` row. Once text blockers
have been written, dropping the table loses them (task blockers survive in the old column).
