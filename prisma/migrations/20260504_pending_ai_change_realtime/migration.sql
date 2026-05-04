-- Enable Realtime for PendingAIChange: the sidebar inbox badge subscribes
-- to INSERT events so it pings within ~1s of a new draft instead of waiting
-- up to 30s for the next poll. Mirrors the Notification realtime setup.

-- RLS policy: any authenticated VendorUser can SELECT all rows. We don't
-- per-row scope because the inbox count + listing already filter
-- application-side (see lib/db.js#listPendingAIChanges forVendorUserId).
-- Realtime delivers events for rows the subscriber can SELECT, so this
-- policy gates "who gets badge pings" to authenticated team members.
DROP POLICY IF EXISTS "vendor_select_pending_ai_changes" ON "PendingAIChange";
CREATE POLICY "vendor_select_pending_ai_changes"
  ON "PendingAIChange"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "VendorUser" WHERE "authUserId" = auth.uid()::text)
  );

-- Add PendingAIChange to the supabase_realtime publication. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'PendingAIChange'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PendingAIChange";
  END IF;
END $$;
