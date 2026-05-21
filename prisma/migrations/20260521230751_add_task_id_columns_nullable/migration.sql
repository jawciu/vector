-- Phase 1 of the Task IDs feature.
-- Purely additive: nullable or default-bearing columns, indexes, and one FK with NO ACTION.
-- No existing columns altered; no DROP/RENAME.
-- Backfill runs as a separate script (scripts/backfill-task-ids.js).
-- Migration 3 will tighten constraints (NOT NULL + unique) after backfill.
--
-- Note on Task.createdAt: CURRENT_TIMESTAMP is a volatile default, so this
-- rewrites the Task table once. At current row counts (hundreds) the rewrite
-- is sub-second. For larger tables prefer: ADD nullable -> backfill -> SET NOT NULL.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "prefix" TEXT,
ADD COLUMN     "taskCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "companyId" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Company_prefix_key" ON "Company"("prefix");

-- CreateIndex
CREATE INDEX "Task_companyId_number_idx" ON "Task"("companyId", "number");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
