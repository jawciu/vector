-- Run this in Supabase: SQL Editor → New query → paste → Run
-- Creates Company, Onboarding, Task tables to match prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "Company" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Onboarding" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Task" (
  "id" SERIAL PRIMARY KEY,
  "onboardingId" INTEGER NOT NULL REFERENCES "Onboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "due" TEXT NOT NULL,
  "waitingOn" TEXT NOT NULL
);
