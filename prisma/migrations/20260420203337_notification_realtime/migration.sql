-- Enable Realtime for Notification: vendor inbox subscribes via Supabase
-- client and receives INSERT events the moment a row is written.

-- RLS is enabled on all public tables (CLAUDE.md note). Add a SELECT policy
-- so the authenticated role can read rows where recipientVendorId maps
-- back to their auth user via VendorUser.authUserId. Prisma bypasses RLS
-- as the postgres role, so this policy only constrains Realtime clients.
DROP POLICY IF EXISTS "vendor_select_own_notifications" ON "Notification";
CREATE POLICY "vendor_select_own_notifications"
  ON "Notification"
  FOR SELECT
  TO authenticated
  USING (
    "recipientVendorId" IN (
      SELECT id FROM "VendorUser" WHERE "authUserId" = auth.uid()::text
    )
  );

-- Add Notification to the supabase_realtime publication so INSERT/UPDATE
-- events are streamed. Idempotent — skip if already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Notification";
  END IF;
END $$;
