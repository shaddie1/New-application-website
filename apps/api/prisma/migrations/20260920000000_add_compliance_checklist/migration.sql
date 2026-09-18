-- Compliance checklist: the 56-item checklist, its status log, and the company readiness flags.
-- Also adds the COO and Business Development Lead roles (IF NOT EXISTS: other branches add them too).

-- CreateEnum
CREATE TYPE "CompliancePriority" AS ENUM ('MUST_HAVE', 'MUST_HAVE_IF_ELIGIBLE', 'MUST_HAVE_IF_GO', 'MUST_HAVE_BEFORE_HIRING', 'RECOMMENDED', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ComplianceEventKind" AS ENUM ('SEEDED', 'STATUS_CHANGED', 'DETAILS_CHANGED', 'NOTE_ADDED');

-- CreateEnum
CREATE TYPE "LaundryGoDecision" AS ENUM ('PENDING', 'GO', 'NO_GO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COO';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUSINESS_DEVELOPMENT_LEAD';

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "itemNo" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "itemAction" TEXT NOT NULL,
    "priority" "CompliancePriority" NOT NULL,
    "whyItMatters" TEXT,
    "owner" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "costType" TEXT NOT NULL,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dateDone" DATE,
    "sourceOrNote" TEXT,
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "ComplianceEventKind" NOT NULL,
    "fromStatus" "ComplianceStatus",
    "toStatus" "ComplianceStatus",
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyReadinessFlags" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "agpoEligible" BOOLEAN NOT NULL DEFAULT false,
    "laundryGoDecision" "LaundryGoDecision" NOT NULL DEFAULT 'PENDING',
    "hiringStarted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReadinessFlags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceItem_itemNo_key" ON "ComplianceItem"("itemNo");

-- CreateIndex
CREATE INDEX "ComplianceItem_category_idx" ON "ComplianceItem"("category");

-- CreateIndex
CREATE INDEX "ComplianceItem_status_idx" ON "ComplianceItem"("status");

-- CreateIndex
CREATE INDEX "ComplianceEvent_itemId_createdAt_idx" ON "ComplianceEvent"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ComplianceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReadinessFlags" ADD CONSTRAINT "CompanyReadinessFlags_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

