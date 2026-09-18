-- Pipeline tracker: leads, tenders, their activity logs, and the locked funnel targets.

-- CreateEnum
CREATE TYPE "LeadSegment" AS ENUM ('HOUSEHOLD', 'COMMERCIAL', 'MEDICAL', 'DEVELOPER', 'NGO', 'PUBLIC_SECTOR');

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('DIRECT_OUTREACH', 'WARM_INTRO', 'HOUSEHOLD_ENQUIRY', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONVERSATION', 'SITE_VISIT', 'PROPOSAL_SENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadEventKind" AS ENUM ('CREATED', 'STAGE_CHANGED', 'DETAILS_CHANGED', 'NOTE_ADDED', 'QUOTE_LINKED', 'COMMISSION_PAID');

-- CreateEnum
CREATE TYPE "TenderKind" AS ENUM ('PUBLIC_TENDER', 'PRIVATE_RFQ');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('IDENTIFIED', 'PREPARING', 'PACK_WITH_COO', 'SUBMITTED', 'AWARDED', 'NOT_AWARDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TenderEventKind" AS ENUM ('CREATED', 'STATUS_CHANGED', 'DETAILS_CHANGED', 'NOTE_ADDED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organisation" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "segment" "LeadSegment" NOT NULL,
    "channel" "LeadChannel" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "bdOwnerId" TEXT,
    "siteLocation" TEXT,
    "estimatedValueCents" INTEGER,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "traineeSourced" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "nextActionAt" DATE,
    "quoteRequestId" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "revenueReceivedCents" INTEGER,
    "actualDirectCostsCents" INTEGER,
    "netProfitCents" INTEGER,
    "commissionPct" DOUBLE PRECISION,
    "commissionCents" INTEGER,
    "commissionPaidAt" TIMESTAMP(3),
    "commissionReference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "LeadEventKind" NOT NULL,
    "stage" "LeadStage",
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "reference" TEXT,
    "kind" "TenderKind" NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "estimatedValueCents" INTEGER,
    "submissionDeadline" DATE NOT NULL,
    "packToCooBy" DATE NOT NULL,
    "ownerId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderEvent" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "kind" "TenderEventKind" NOT NULL,
    "status" "TenderStatus",
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelTargets" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelTargets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_quoteRequestId_key" ON "Lead"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_segment_idx" ON "Lead"("segment");

-- CreateIndex
CREATE INDEX "Lead_channel_idx" ON "Lead"("channel");

-- CreateIndex
CREATE INDEX "Lead_bdOwnerId_idx" ON "Lead"("bdOwnerId");

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_createdAt_idx" ON "LeadEvent"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadEvent_kind_createdAt_idx" ON "LeadEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Tender_status_idx" ON "Tender"("status");

-- CreateIndex
CREATE INDEX "Tender_submissionDeadline_idx" ON "Tender"("submissionDeadline");

-- CreateIndex
CREATE INDEX "TenderEvent_tenderId_createdAt_idx" ON "TenderEvent"("tenderId", "createdAt");

-- CreateIndex
CREATE INDEX "TenderEvent_kind_createdAt_idx" ON "TenderEvent"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_bdOwnerId_fkey" FOREIGN KEY ("bdOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderEvent" ADD CONSTRAINT "TenderEvent_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderEvent" ADD CONSTRAINT "TenderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelTargets" ADD CONSTRAINT "FunnelTargets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

