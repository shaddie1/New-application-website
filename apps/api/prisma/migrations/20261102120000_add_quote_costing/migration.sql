-- Quote costing: what a quote costs to deliver beyond the site survey (lunch,
-- machines, upfront purchases, hand-set crew) and the price the client pays.
-- Held apart from the survey, which every staff role reads, so only the owner,
-- admin, finance and the COO see it. Each estimate keeps a copy of the costing
-- it was computed from, so an approved figure never moves.
--
-- Safe on a live database: one new table and one nullable column; no existing
-- row changes. Must sort after 20261101000000_add_quote_builder, which
-- creates "QuoteEstimate".

-- AlterTable
ALTER TABLE "QuoteEstimate" ADD COLUMN     "costingSnapshot" JSONB;

-- CreateTable
CREATE TABLE "QuoteCosting" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteCosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCosting_quoteRequestId_key" ON "QuoteCosting"("quoteRequestId");

-- AddForeignKey
ALTER TABLE "QuoteCosting" ADD CONSTRAINT "QuoteCosting_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCosting" ADD CONSTRAINT "QuoteCosting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
