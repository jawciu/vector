-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "activityLogId" INTEGER NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientVendorId" INTEGER,
    "recipientContactId" INTEGER,
    "groupKey" TEXT NOT NULL,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientVendorId_readAt_idx" ON "Notification"("recipientVendorId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_recipientContactId_readAt_idx" ON "Notification"("recipientContactId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_groupKey_idx" ON "Notification"("groupKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_activityLogId_fkey" FOREIGN KEY ("activityLogId") REFERENCES "ActivityLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientVendorId_fkey" FOREIGN KEY ("recipientVendorId") REFERENCES "VendorUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientContactId_fkey" FOREIGN KEY ("recipientContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
