-- Add priority, commentCount, previousStatus fields to Task
ALTER TABLE "Task" ADD COLUMN "priority" TEXT;
ALTER TABLE "Task" ADD COLUMN "commentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "previousStatus" TEXT;

-- Rename old "To do" status to "Not started"
UPDATE "Task" SET status = 'Not started' WHERE status = 'To do';
