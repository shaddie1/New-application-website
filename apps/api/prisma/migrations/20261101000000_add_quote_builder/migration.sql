-- Quote Builder: COO role, approval states on quotes, and the survey /
-- estimate / rates tables behind the internal estimate.

-- CreateEnum
CREATE TYPE "DistanceZone" AS ENUM ('ZONE1', 'ZONE2', 'ZONE3');

-- CreateEnum
CREATE TYPE "SoilLevel" AS ENUM ('LIGHT', 'NORMAL', 'HEAVY');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuoteStatus" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "QuoteStatus" ADD VALUE 'APPROVED';

-- CreateTable
CREATE TABLE "QuoteSurvey" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "distanceZone" "DistanceZone" NOT NULL DEFAULT 'ZONE1',
    "soilLevel" "SoilLevel" NOT NULL DEFAULT 'NORMAL',
    "frequencyLabel" TEXT NOT NULL,
    "workingWindowHours" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "supervisorOnSite" BOOLEAN NOT NULL DEFAULT false,
    "traineeSourced" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "areas" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEstimate" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "surveySnapshot" JSONB NOT NULL,
    "ratesSnapshot" JSONB NOT NULL,
    "ratesUpdatedAt" TIMESTAMP(3),
    "output" JSONB NOT NULL,
    "computedById" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "QuoteEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRates" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSurvey_quoteRequestId_key" ON "QuoteSurvey"("quoteRequestId");

-- CreateIndex
CREATE INDEX "QuoteEstimate_quoteRequestId_computedAt_idx" ON "QuoteEstimate"("quoteRequestId", "computedAt");

-- AddForeignKey
ALTER TABLE "QuoteSurvey" ADD CONSTRAINT "QuoteSurvey_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSurvey" ADD CONSTRAINT "QuoteSurvey_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEstimate" ADD CONSTRAINT "QuoteEstimate_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEstimate" ADD CONSTRAINT "QuoteEstimate_computedById_fkey" FOREIGN KEY ("computedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEstimate" ADD CONSTRAINT "QuoteEstimate_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEstimate" ADD CONSTRAINT "QuoteEstimate_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRates" ADD CONSTRAINT "QuoteRates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

