-- Add missing Task columns (description, owner, members, notes) and drop waitingOn
ALTER TABLE "Task" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Task" ADD COLUMN "owner" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Task" ADD COLUMN "members" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Task" DROP COLUMN "waitingOn";

-- Create Comment table (was missing from migrations)
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
