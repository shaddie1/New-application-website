-- CreateEnum (shared with feat/compliance-checklist; guarded so either lands first)
DO $$ BEGIN
  CREATE TYPE "LaundryGoDecision" AS ENUM ('PENDING', 'GO', 'NO_GO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
CREATE TYPE "ReserveEntryKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "PayPhase" AS ENUM ('NOW', 'COMPLIANT');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COO';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "laundryKg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyReadinessFlags" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "agpoEligible" BOOLEAN NOT NULL DEFAULT false,
    "laundryGoDecision" "LaundryGoDecision" NOT NULL DEFAULT 'PENDING',
    "hiringStarted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReadinessFlags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundrySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pricePerKgCents" INTEGER NOT NULL DEFAULT 10000,
    "consumablesPct" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "workingDaysPerMonth" INTEGER NOT NULL DEFAULT 26,
    "fixedCostsNowCents" INTEGER NOT NULL DEFAULT 3138542,
    "fixedCostsCompliantCents" INTEGER NOT NULL DEFAULT 4201685,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaundrySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveEntry" (
    "id" TEXT NOT NULL,
    "kind" "ReserveEntryKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompliantPayReadiness" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "payPhase" "PayPhase" NOT NULL DEFAULT 'NOW',
    "gate1MarginMet" BOOLEAN NOT NULL DEFAULT false,
    "gate1FirstMetMonth" DATE,
    "laundryOperational" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompliantPayReadiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReserveEntry_date_idx" ON "ReserveEntry"("date");

-- AddForeignKey (guarded, see above)
DO $$ BEGIN
  ALTER TABLE "CompanyReadinessFlags" ADD CONSTRAINT "CompanyReadinessFlags_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
ALTER TABLE "LaundrySettings" ADD CONSTRAINT "LaundrySettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveEntry" ADD CONSTRAINT "ReserveEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliantPayReadiness" ADD CONSTRAINT "CompliantPayReadiness_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

