-- Pipeline tracker: leads, tenders, their activity logs, and the locked funnel targets.

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('CONTACTED', 'CONVERSATION', 'SITE_VISIT', 'PROPOSAL_SENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadEventKind" AS ENUM ('CREATED', 'STAGE_CHANGED', 'DETAILS_CHANGED', 'NOTE_ADDED', 'QUOTE_LINKED', 'COMMISSION_PAID');

-- CreateEnum
CREATE TYPE "TenderType" AS ENUM ('TENDER', 'EOI', 'RFQ', 'PREQUALIFICATION');

-- CreateEnum
CREATE TYPE "BidDecision" AS ENUM ('BID', 'NO_BID');

-- CreateEnum
CREATE TYPE "TenderEventKind" AS ENUM ('CREATED', 'STATUS_CHANGED', 'DETAILS_CHANGED', 'NOTE_ADDED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "dateLogged" DATE NOT NULL,
    "clientOrg" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "broughtInById" TEXT,
    "channel" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'CONTACTED',
    "quoteValueCents" INTEGER,
    "contractType" TEXT,
    "expectedClose" DATE,
    "linkedQuoteId" TEXT,
    "notes" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "revenueReceivedCents" INTEGER,
    "actualDirectCostsCents" INTEGER,
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
    "fromStage" "LeadStage",
    "toStage" "LeadStage",
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
    "tenderRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuingOrg" TEXT NOT NULL,
    "sourcePortal" TEXT,
    "type" "TenderType" NOT NULL,
    "agpoReserved" BOOLEAN NOT NULL DEFAULT false,
    "dateFound" DATE NOT NULL,
    "submissionDeadline" DATE NOT NULL,
    "packToCooBy" DATE NOT NULL,
    "bidDecision" "BidDecision",
    "status" TEXT NOT NULL DEFAULT 'Identified',
    "dateSentToCoo" DATE,
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
    "fromStatus" TEXT,
    "toStatus" TEXT,
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
CREATE UNIQUE INDEX "Lead_leadId_key" ON "Lead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_linkedQuoteId_key" ON "Lead"("linkedQuoteId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_broughtInById_idx" ON "Lead"("broughtInById");

-- CreateIndex
CREATE INDEX "Lead_dateLogged_idx" ON "Lead"("dateLogged");

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_createdAt_idx" ON "LeadEvent"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadEvent_kind_createdAt_idx" ON "LeadEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Tender_submissionDeadline_idx" ON "Tender"("submissionDeadline");

-- CreateIndex
CREATE INDEX "TenderEvent_tenderId_createdAt_idx" ON "TenderEvent"("tenderId", "createdAt");

-- CreateIndex
CREATE INDEX "TenderEvent_kind_createdAt_idx" ON "TenderEvent"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_broughtInById_fkey" FOREIGN KEY ("broughtInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_linkedQuoteId_fkey" FOREIGN KEY ("linkedQuoteId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderEvent" ADD CONSTRAINT "TenderEvent_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderEvent" ADD CONSTRAINT "TenderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelTargets" ADD CONSTRAINT "FunnelTargets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

