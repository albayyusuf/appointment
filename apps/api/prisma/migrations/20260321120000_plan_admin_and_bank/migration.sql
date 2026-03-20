-- AlterTable Plan: admin & storefront fields
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "badgeLabel" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "featureLines" JSONB;

-- CreateTable PlatformBankAccount
CREATE TABLE IF NOT EXISTS "PlatformBankAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "swift" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformBankAccount_pkey" PRIMARY KEY ("id")
);
