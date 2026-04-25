-- Add Insight (cached AI summaries) and AICall (cost / observability log)
-- for Phase 1 of the AI features.

-- CreateTable
CREATE TABLE "Insight" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insight_scope_scopeId_generatedAt_idx" ON "Insight"("scope", "scopeId", "generatedAt");

-- CreateTable
CREATE TABLE "AICall" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "scopeId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "requestId" TEXT,

    CONSTRAINT "AICall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AICall_kind_createdAt_idx" ON "AICall"("kind", "createdAt");

-- Enable RLS to match existing tables (CLAUDE.md: RLS enabled on all public tables, no policies for now since Prisma bypasses as postgres role)
ALTER TABLE "Insight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AICall" ENABLE ROW LEVEL SECURITY;
