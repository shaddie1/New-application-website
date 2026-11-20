-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "payInId" TEXT;

-- AlterTable
ALTER TABLE "ProfitDistribution" ADD COLUMN     "marketingCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProjectMachine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "halfDaysPerVisit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPayIn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPayIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMachine_assetId_idx" ON "ProjectMachine"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMachine_projectId_assetId_key" ON "ProjectMachine"("projectId", "assetId");

-- CreateIndex
CREATE INDEX "ProjectPayIn_projectId_idx" ON "ProjectPayIn"("projectId");

-- CreateIndex
CREATE INDEX "Investment_payInId_idx" ON "Investment"("payInId");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_payInId_fkey" FOREIGN KEY ("payInId") REFERENCES "ProjectPayIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMachine" ADD CONSTRAINT "ProjectMachine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMachine" ADD CONSTRAINT "ProjectMachine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayIn" ADD CONSTRAINT "ProjectPayIn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayIn" ADD CONSTRAINT "ProjectPayIn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

