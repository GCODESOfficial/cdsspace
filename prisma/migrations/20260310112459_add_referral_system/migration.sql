/*
  Warnings:

  - A unique constraint covering the columns `[referralCode]` on the table `profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "referralCode" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "assets" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referrerId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "profiles_referralCode_key" ON "profiles"("referralCode");
