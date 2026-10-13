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

## 1. Dry run (writes nothing)

Run the script, **never paste its steps or `source` it** (a pasted `set -e` would close the
terminal on the first non-zero exit):

```bash
DIRECT_DATABASE_URL='<target>' bash scripts/migrations/apply-task-dependency.sh dry-run
```

The target must be given explicitly as `DIRECT_DATABASE_URL` on the command line; the script refuses to fall back to `.env`. It prints the target (host:port/database) first,
runs the migration SQL inside `BEGIN ... ROLLBACK`, and checks that the backfill has one row per
task with a `blockedByTaskId`, every pair matching the old column. Exit 0 = passed. It refuses if
the table already exists. Read the output before going further; on live, run it only with
Caroline's go-ahead, even though it rolls back.

## 2. Apply (live: only with Caroline's explicit go-ahead)

```bash
DIRECT_DATABASE_URL='<target>' bash scripts/migrations/apply-task-dependency.sh apply
```

Steps, each gated on the previous one's exit code:

1. the same dry run (stops if it fails);
2. `prisma migrate status` (exits 1 while the migration is pending: expected, ignored);
3. a prompt naming the target host: type `APPLY` to write;
4. `prisma db execute --file .../migration.sql` (URL from `prisma.config.ts`, i.e.
   `DIRECT_DATABASE_URL`; Prisma 7.4 has no `--url` flag here and fails with
   `unknown or unexpected option: --url`, exit 1);
5. `node scripts/migrations/task-dependency-check.mjs verify`: exits 1 if the table is missing
   or any old-column blocker has no row, and then `migrate resolve` is NOT run;
6. `prisma migrate resolve --applied 20261013120000_add_task_dependency`;
7. `prisma migrate status`, which must now say the schema is up to date.

`DIRECT_DATABASE_URL` must be the session pooler (port 5432) of the target database.

Proof on a fresh clone of the live snapshot (dry run, declined prompt, full apply, refusal on a
second run, verify refusing an unapplied database):
`/Users/caro/Code/onboarding-ts-eval/feat2/runbook-proof.txt`.

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
