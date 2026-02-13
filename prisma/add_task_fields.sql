-- Add owner and notes fields to Task table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "owner" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
