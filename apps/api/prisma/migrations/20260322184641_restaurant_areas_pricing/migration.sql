-- AlterEnum
ALTER TYPE "VerticalType" ADD VALUE 'RESTAURANT';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "restaurantAreaId" TEXT,
ALTER COLUMN "staffUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RestaurantArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "revenueLabel" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantAreaSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "restaurantAreaId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantAreaSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPricingDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "surchargePercent" DECIMAL(5,2),
    "extraAmount" DECIMAL(12,2),
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchPricingDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantArea_tenantId_branchId_idx" ON "RestaurantArea"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantArea_tenantId_branchId_code_key" ON "RestaurantArea"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "RestaurantAreaSchedule_tenantId_branchId_startsAt_endsAt_idx" ON "RestaurantAreaSchedule"("tenantId", "branchId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "RestaurantAreaSchedule_tenantId_restaurantAreaId_startsAt_e_idx" ON "RestaurantAreaSchedule"("tenantId", "restaurantAreaId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BranchPricingDay_tenantId_branchId_idx" ON "BranchPricingDay"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchPricingDay_branchId_date_key" ON "BranchPricingDay"("branchId", "date");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_restaurantAreaId_startsAt_endsAt_idx" ON "Appointment"("tenantId", "restaurantAreaId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "RestaurantArea" ADD CONSTRAINT "RestaurantArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantArea" ADD CONSTRAINT "RestaurantArea_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantAreaSchedule" ADD CONSTRAINT "RestaurantAreaSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantAreaSchedule" ADD CONSTRAINT "RestaurantAreaSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantAreaSchedule" ADD CONSTRAINT "RestaurantAreaSchedule_restaurantAreaId_fkey" FOREIGN KEY ("restaurantAreaId") REFERENCES "RestaurantArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPricingDay" ADD CONSTRAINT "BranchPricingDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPricingDay" ADD CONSTRAINT "BranchPricingDay_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_restaurantAreaId_fkey" FOREIGN KEY ("restaurantAreaId") REFERENCES "RestaurantArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of staff or restaurant area
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staff_or_area_chk" CHECK (
  ("staffUserId" IS NOT NULL AND "restaurantAreaId" IS NULL) OR
  ("staffUserId" IS NULL AND "restaurantAreaId" IS NOT NULL)
);
