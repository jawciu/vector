-- Phase 3 (Miniti integration): ExternalEvent, PendingAIChange, IntegrationConnection
-- Plus Company.domain field for matching meeting attendees → company.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "domain" TEXT;

-- CreateTable
CREATE TABLE "ExternalEvent" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "onboardingId" INTEGER,
    "matchAmbiguous" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "ExternalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEvent_source_sourceId_key" ON "ExternalEvent"("source", "sourceId");

-- CreateIndex
CREATE INDEX "ExternalEvent_processedAt_idx" ON "ExternalEvent"("processedAt");

-- CreateIndex
CREATE INDEX "ExternalEvent_onboardingId_idx" ON "ExternalEvent"("onboardingId");

-- AddForeignKey
ALTER TABLE "ExternalEvent" ADD CONSTRAINT "ExternalEvent_onboardingId_fkey"
    FOREIGN KEY ("onboardingId") REFERENCES "Onboarding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PendingAIChange" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" INTEGER,
    "onboardingId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceQuote" TEXT,
    "sourceUrl" TEXT,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,
    "appliedTaskId" INTEGER,

    CONSTRAINT "PendingAIChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingAIChange_onboardingId_status_idx" ON "PendingAIChange"("onboardingId", "status");

-- CreateIndex
CREATE INDEX "PendingAIChange_status_createdAt_idx" ON "PendingAIChange"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PendingAIChange" ADD CONSTRAINT "PendingAIChange_sourceEventId_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "ExternalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAIChange" ADD CONSTRAINT "PendingAIChange_onboardingId_fkey"
    FOREIGN KEY ("onboardingId") REFERENCES "Onboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "config" JSONB NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_source_key" ON "IntegrationConnection"("source");

-- CreateIndex
CREATE INDEX "IntegrationConnection_status_idx" ON "IntegrationConnection"("status");

-- Match existing tables: enable RLS (no policies — Prisma bypasses as postgres role)
ALTER TABLE "ExternalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingAIChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
