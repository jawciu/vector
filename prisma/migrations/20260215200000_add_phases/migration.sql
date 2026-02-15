-- CreateTable
CREATE TABLE "Phase" (
    "id" SERIAL NOT NULL,
    "onboardingId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3),
    "isComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "Onboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add phaseId column (nullable initially)
ALTER TABLE "Task" ADD COLUMN "phaseId" INTEGER;

-- Add blockedByTaskId column
ALTER TABLE "Task" ADD COLUMN "blockedByTaskId" INTEGER;

-- Data migration: create default phases for each existing onboarding
INSERT INTO "Phase" ("onboardingId", "name", "sortOrder")
SELECT o."id", p."name", p."sortOrder"
FROM "Onboarding" o
CROSS JOIN (
    VALUES (0, 'Kickoff'), (1, 'Configuration'), (2, 'Data Migration'), (3, 'Training'), (4, 'Go-Live')
) AS p("sortOrder", "name");

-- Assign all existing tasks to the first phase (Kickoff, sortOrder=0) of their onboarding
UPDATE "Task" t
SET "phaseId" = p."id"
FROM "Phase" p
WHERE p."onboardingId" = t."onboardingId" AND p."sortOrder" = 0;

-- Make phaseId NOT NULL now that all tasks have a phase
ALTER TABLE "Task" ALTER COLUMN "phaseId" SET NOT NULL;

-- AddForeignKey for phaseId
ALTER TABLE "Task" ADD CONSTRAINT "Task_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for blockedByTaskId (self-relation)
ALTER TABLE "Task" ADD CONSTRAINT "Task_blockedByTaskId_fkey" FOREIGN KEY ("blockedByTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename status "Todo" to "To do" in existing tasks
UPDATE "Task" SET "status" = 'To do' WHERE "status" = 'Todo';

-- Rename status "Blocked" to "To do" (blocked is now computed)
UPDATE "Task" SET "status" = 'To do' WHERE "status" = 'Blocked';
