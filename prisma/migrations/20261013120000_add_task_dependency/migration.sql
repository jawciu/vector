-- TaskDependency: what a task waits on. Either another task on the board or a
-- free-text label for a blocker that is not a task ("platform team sign-off",
-- "security review closes"). A task can have several. GAPS-PLAN feature 2.
--
-- Rollout is add-then-tighten (CLAUDE.md): this migration is ADDITIVE ONLY.
-- It adds the table and backfills one row per existing Task.blockedByTaskId.
-- Task.blockedByTaskId stays; the app reads dependencies from this table and
-- keeps the old column in sync with the first open task blocker. A later
-- migration retires the column once nothing reads it.
--
-- Hand-written: the Supabase shadow database cannot replay the auth schema, so
-- `prisma migrate dev` fails (P3006). Runbook: README.md next to this file.

-- 1. The table.
CREATE TABLE "TaskDependency" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "blockedByTaskId" INTEGER,
    "label" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id"),
    -- Exactly one kind: a task blocker or a text blocker, never both, never neither.
    CONSTRAINT "TaskDependency_one_kind_check"
      CHECK (num_nonnulls("blockedByTaskId", "label") = 1),
    -- A text blocker has something to say.
    CONSTRAINT "TaskDependency_label_not_blank_check"
      CHECK ("label" IS NULL OR length(btrim("label")) BETWEEN 1 AND 200),
    -- A task cannot wait on itself.
    CONSTRAINT "TaskDependency_not_self_check"
      CHECK ("blockedByTaskId" IS NULL OR "blockedByTaskId" <> "taskId"),
    -- Only text blockers are ticked off by hand; a task blocker is resolved by
    -- its task being Done.
    CONSTRAINT "TaskDependency_resolved_only_label_check"
      CHECK ("resolvedAt" IS NULL OR "label" IS NOT NULL)
);

-- 2. Foreign keys. Deleting the task deletes its dependencies. Deleting the
--    BLOCKER task also deletes the dependency row: the old column's
--    ON DELETE SET NULL meant "no blocker any more", and SET NULL here would
--    break the one-kind CHECK. A text row never points at a task.
ALTER TABLE "TaskDependency"
  ADD CONSTRAINT "TaskDependency_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskDependency"
  ADD CONSTRAINT "TaskDependency_blockedByTaskId_fkey"
  FOREIGN KEY ("blockedByTaskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Indexes: the board loads dependencies by task; deleting a task looks up
--    rows pointing at it. One row per (task, blocker task) pair.
CREATE INDEX "TaskDependency_taskId_idx" ON "TaskDependency"("taskId");
CREATE INDEX "TaskDependency_blockedByTaskId_idx" ON "TaskDependency"("blockedByTaskId");
CREATE UNIQUE INDEX "TaskDependency_taskId_blockedByTaskId_key"
  ON "TaskDependency"("taskId", "blockedByTaskId")
  WHERE "blockedByTaskId" IS NOT NULL;

-- 4. RLS on, like every other public table (Prisma connects as the postgres
--    role and bypasses it; this only closes the PostgREST API).
ALTER TABLE "TaskDependency" ENABLE ROW LEVEL SECURITY;

-- 5. Backfill: one row per task that has a blocker today, dated with the
--    task's own createdAt so it sorts first among that task's dependencies.
--    A task marked as blocking itself (should not exist; the dry run counts
--    them) is skipped rather than failing the migration.
INSERT INTO "TaskDependency" ("taskId", "blockedByTaskId", "createdAt")
SELECT t."id", t."blockedByTaskId", t."createdAt"
FROM "Task" t
WHERE t."blockedByTaskId" IS NOT NULL
  AND t."blockedByTaskId" <> t."id"
ORDER BY t."id";
