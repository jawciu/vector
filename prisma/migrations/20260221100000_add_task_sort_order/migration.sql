-- AlterTable
ALTER TABLE "Task" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Set initial sortOrder based on existing id order within each phase
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "phaseId" ORDER BY id) - 1 AS rn
  FROM "Task"
)
UPDATE "Task" SET "sortOrder" = ranked.rn FROM ranked WHERE "Task".id = ranked.id;
