-- PendingAIChange.ownerId: promote the follow-up owner from a JSON field to a
-- real foreign key.
--
-- Why: `payload.ownerId` was only ever a key inside the JSONB `payload` blob,
-- which Postgres treats as opaque text. When VendorUser 4 (Maya) was merged
-- into VendorUser 8 (the demo login), every relational column was remapped but
-- the JSON kept pointing at the deleted user. Because the follow-up visibility
-- filter reads that field, every follow-up would have silently become invisible
-- to everyone — no error, no warning. A real FK makes Postgres responsible for
-- the reference instead of us.
--
-- Nullable by design: only `draft_followup` rows have an owner. Meeting-derived
-- drafts (create_task / match_existing / update_status) are onboarding-wide.
-- ON DELETE SET NULL so an orphaned draft is never mis-attributed to whoever
-- happens to reuse a recycled id.

-- 1. Add the column (nullable — nothing reads it yet, nothing can break).
ALTER TABLE "PendingAIChange" ADD COLUMN "ownerId" INTEGER;

-- 2. Backfill from the existing JSON, but only where the value is a sane
--    integer AND actually resolves to a live VendorUser. Anything stale is
--    left NULL rather than carried forward as a dangling reference.
UPDATE "PendingAIChange" p
SET "ownerId" = (p."payload" ->> 'ownerId')::INTEGER
WHERE p."action" = 'draft_followup'
  AND jsonb_typeof(p."payload" -> 'ownerId') = 'number'
  AND EXISTS (
    SELECT 1 FROM "VendorUser" v
    WHERE v."id" = (p."payload" ->> 'ownerId')::INTEGER
  );

-- 3. Now enforce the reference.
ALTER TABLE "PendingAIChange"
  ADD CONSTRAINT "PendingAIChange_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "VendorUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. The follow-up filter queries by (action, status, ownerId); index it so the
--    filter can run in the database instead of loading every row into JS.
CREATE INDEX "PendingAIChange_action_status_ownerId_idx"
  ON "PendingAIChange"("action", "status", "ownerId");
