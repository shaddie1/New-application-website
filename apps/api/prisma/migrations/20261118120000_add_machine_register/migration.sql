-- Machine register: each machine can carry a daily rate and earn it for the
-- days it works on a job or on a hire. A machine line is those days on one job
-- and the amount they earned. The amount is a cost of the job, and the sum of
-- a machine's lines is what the machine has earned.
--
-- An asset is on the register when it has a daily rate; "countsFrom" is the
-- day its earnings and repairs start to count. A machine may have investors,
-- each with the amount they put in, and payments to those investors.
--
-- Lines go with their job (CASCADE), as costs do. A line stops its machine
-- being deleted, and a payment stops its investor being deleted (RESTRICT),
-- so money records are never removed along with an asset. Investors of a
-- machine with no lines and no payments go with it (CASCADE).
--
-- The check keeps a line's amount equal to halfDays x rateCents / 2.
--
-- Safe on a live database: two new nullable columns and three new, empty
-- tables. No existing row changes.
-- Must sort after 20261112120000_add_shareholder_removed_at.

-- AlterTable
ALTER TABLE "Asset"
  ADD COLUMN "dailyRateCents" INTEGER,
  ADD COLUMN "countsFrom" DATE;

-- CreateTable
CREATE TABLE "MachineLine" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "halfDays" INTEGER NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "isHire" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineInvestor" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contributionCents" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineInvestor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachinePayout" (
    "id" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachinePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineLine_jobId_idx" ON "MachineLine"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "MachineLine_assetId_jobId_key" ON "MachineLine"("assetId", "jobId");

-- CreateIndex
CREATE INDEX "MachineInvestor_assetId_idx" ON "MachineInvestor"("assetId");

-- CreateIndex
CREATE INDEX "MachinePayout_investorId_idx" ON "MachinePayout"("investorId");

-- AddForeignKey
ALTER TABLE "MachineLine" ADD CONSTRAINT "MachineLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineLine" ADD CONSTRAINT "MachineLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineLine" ADD CONSTRAINT "MachineLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineInvestor" ADD CONSTRAINT "MachineInvestor_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineInvestor" ADD CONSTRAINT "MachineInvestor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachinePayout" ADD CONSTRAINT "MachinePayout_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "MachineInvestor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachinePayout" ADD CONSTRAINT "MachinePayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE "MachineLine" ADD CONSTRAINT "MachineLine_amount_check" CHECK ("halfDays" > 0 AND "rateCents" > 0 AND "amountCents" * 2 = "halfDays" * "rateCents");
