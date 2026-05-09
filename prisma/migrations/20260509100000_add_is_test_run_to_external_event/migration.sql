-- Flag for ExternalEvent rows fired by the /admin/ai test webhook panel.
-- Hidden from per-onboarding Meetings tab (which shows only real meetings)
-- and shown with a test-tube badge in the admin Pipeline timeline.
ALTER TABLE "ExternalEvent" ADD COLUMN "isTestRun" BOOLEAN NOT NULL DEFAULT FALSE;
