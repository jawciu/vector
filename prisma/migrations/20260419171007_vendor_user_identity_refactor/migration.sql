-- AlterTable
ALTER TABLE "Onboarding" ADD COLUMN     "ownerId" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "ownerId" INTEGER;

-- CreateTable
CREATE TABLE "VendorUser" (
    "id" SERIAL NOT NULL,
    "authUserId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorUser_authUserId_key" ON "VendorUser"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorUser_email_key" ON "VendorUser"("email");

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "VendorUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "VendorUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
