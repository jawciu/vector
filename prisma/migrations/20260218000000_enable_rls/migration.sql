-- Enable Row Level Security on all public tables
-- The app uses Prisma which connects as the postgres role (bypasses RLS),
-- so this only restricts access via Supabase's PostgREST API.

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Onboarding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Phase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
