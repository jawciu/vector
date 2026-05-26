-- Phase 3 of the Task IDs feature. Runs after backfill populated all rows.
-- Tightens NOT NULL on backfilled columns, promotes the (companyId, number)
-- index to unique, adds format CHECKs, installs the task↔company consistency trigger.
--
-- All operations are guarded: SET NOT NULL fails fast if any row is NULL,
-- unique index creation fails fast on duplicates. Apply only after running
-- scripts/backfill-task-ids.js and verifying all sanity checks pass.

-- 1. NOT NULL on backfilled columns
ALTER TABLE "Company" ALTER COLUMN "prefix" SET NOT NULL;
ALTER TABLE "Task"    ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Task"    ALTER COLUMN "number" SET NOT NULL;

-- 2. Swap non-unique index for unique
DROP INDEX "Task_companyId_number_idx";
CREATE UNIQUE INDEX "Task_companyId_number_key" ON "Task"("companyId", "number");

-- 3. Format CHECKs (defense-in-depth — app code validates first, DB is the safety net)
ALTER TABLE "Company"
  ADD CONSTRAINT "Company_prefix_format"
  CHECK ("prefix" ~ '^[A-Z][A-Z0-9]{1,4}$');

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_number_positive"
  CHECK ("number" > 0);

-- 4. Trigger: enforce Task.companyId = Onboarding.companyId on INSERT and on UPDATE
--    of either onboardingId or companyId. Fires per-row, BEFORE the write commits.
CREATE OR REPLACE FUNCTION check_task_company_consistency() RETURNS TRIGGER AS $$
DECLARE
  expected_company_id INTEGER;
BEGIN
  SELECT "companyId" INTO expected_company_id
    FROM "Onboarding"
   WHERE "id" = NEW."onboardingId";

  IF expected_company_id IS NULL THEN
    RAISE EXCEPTION 'Onboarding % not found for Task %', NEW."onboardingId", NEW."id";
  END IF;

  IF NEW."companyId" IS DISTINCT FROM expected_company_id THEN
    RAISE EXCEPTION 'Task.companyId (%) must equal Onboarding.companyId (%) for onboarding %',
      NEW."companyId", expected_company_id, NEW."onboardingId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_company_consistency
  BEFORE INSERT OR UPDATE OF "onboardingId", "companyId" ON "Task"
  FOR EACH ROW EXECUTE FUNCTION check_task_company_consistency();
