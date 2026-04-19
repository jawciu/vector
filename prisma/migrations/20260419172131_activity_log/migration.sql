-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "onboardingId" INTEGER NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorVendorId" INTEGER,
    "actorContactId" INTEGER,
    "verb" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_onboardingId_createdAt_idx" ON "ActivityLog"("onboardingId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_actorVendorId_idx" ON "ActivityLog"("actorVendorId");

-- CreateIndex
CREATE INDEX "ActivityLog_actorContactId_idx" ON "ActivityLog"("actorContactId");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "Onboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorVendorId_fkey" FOREIGN KEY ("actorVendorId") REFERENCES "VendorUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorContactId_fkey" FOREIGN KEY ("actorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
