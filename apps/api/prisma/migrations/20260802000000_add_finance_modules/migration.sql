-- Finance expansion: marketing spend, asset register (with maintenance log),
-- investments, and per-period profit distributions.
--
-- Every table carries provenance ("createdById" + timestamps) and a source
-- reference, because these are the records shareholders audit.

CREATE TYPE "ClientSegment"      AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MEDICAL', 'DEVELOPER');
CREATE TYPE "MarketingChannel"   AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'GOOGLE', 'WHATSAPP', 'FLYERS', 'RADIO', 'REFERRAL', 'OTHER');
CREATE TYPE "AssetCategory"      AS ENUM ('MACHINE', 'VEHICLE', 'EQUIPMENT', 'TOOL', 'IT', 'FURNITURE', 'OTHER');
CREATE TYPE "AssetCondition"     AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED');
CREATE TYPE "InvestmentKind"     AS ENUM ('CAPITAL_INJECTION', 'LOAN', 'GRANT', 'OTHER');
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- Source documents and reconciliation on existing expenses.
ALTER TABLE "Expense"
    ADD COLUMN "receiptRef" TEXT,
    ADD COLUMN "receiptUrl" TEXT,
    ADD COLUMN "reconciled" BOOLEAN NOT NULL DEFAULT false;

-- Revenue analysis dimensions on jobs.
ALTER TABLE "Job"
    ADD COLUMN "serviceLineCode" TEXT,
    ADD COLUMN "region"          TEXT,
    ADD COLUMN "clientSegment"   "ClientSegment";

CREATE TABLE "MarketingSpend" (
    "id"            TEXT               NOT NULL,
    "campaign"      TEXT               NOT NULL,
    "channel"       "MarketingChannel" NOT NULL,
    "amountCents"   INTEGER            NOT NULL,
    "date"          DATE               NOT NULL,
    "notes"         TEXT,
    "leadsCount"    INTEGER,
    "bookingsCount" INTEGER,
    "receiptRef"    TEXT,
    "receiptUrl"    TEXT,
    "reconciled"    BOOLEAN            NOT NULL DEFAULT false,
    "createdById"   TEXT               NOT NULL,
    "createdAt"     TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)       NOT NULL,
    CONSTRAINT "MarketingSpend_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketingSpend_date_idx"    ON "MarketingSpend"("date");
CREATE INDEX "MarketingSpend_channel_idx" ON "MarketingSpend"("channel");
ALTER TABLE "MarketingSpend"
    ADD CONSTRAINT "MarketingSpend_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Asset" (
    "id"                TEXT             NOT NULL,
    "name"              TEXT             NOT NULL,
    "category"          "AssetCategory"  NOT NULL,
    "purchaseDate"      DATE             NOT NULL,
    "costCents"         INTEGER          NOT NULL,
    "supplier"          TEXT,
    "serialNumber"      TEXT,
    "location"          TEXT,
    "usefulLifeMonths"  INTEGER,
    "salvageValueCents" INTEGER          NOT NULL DEFAULT 0,
    "condition"         "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "retiredAt"         TIMESTAMP(3),
    "notes"             TEXT,
    "receiptRef"        TEXT,
    "receiptUrl"        TEXT,
    "createdById"       TEXT             NOT NULL,
    "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Asset_category_idx"     ON "Asset"("category");
CREATE INDEX "Asset_purchaseDate_idx" ON "Asset"("purchaseDate");
ALTER TABLE "Asset"
    ADD CONSTRAINT "Asset_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetMaintenance" (
    "id"          TEXT         NOT NULL,
    "assetId"     TEXT         NOT NULL,
    "date"        DATE         NOT NULL,
    "description" TEXT         NOT NULL,
    "costCents"   INTEGER      NOT NULL DEFAULT 0,
    "performedBy" TEXT,
    "receiptRef"  TEXT,
    "createdById" TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetMaintenance_assetId_idx" ON "AssetMaintenance"("assetId");
CREATE INDEX "AssetMaintenance_date_idx"    ON "AssetMaintenance"("date");
ALTER TABLE "AssetMaintenance"
    ADD CONSTRAINT "AssetMaintenance_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetMaintenance"
    ADD CONSTRAINT "AssetMaintenance_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Investment" (
    "id"            TEXT             NOT NULL,
    "source"        TEXT             NOT NULL,
    "kind"          "InvestmentKind" NOT NULL DEFAULT 'CAPITAL_INJECTION',
    "amountCents"   INTEGER          NOT NULL,
    "date"          DATE             NOT NULL,
    "purpose"       TEXT             NOT NULL,
    "shareholderId" TEXT,
    "reference"     TEXT,
    "documentUrl"   TEXT,
    "createdById"   TEXT             NOT NULL,
    "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Investment_date_idx"          ON "Investment"("date");
CREATE INDEX "Investment_shareholderId_idx" ON "Investment"("shareholderId");
ALTER TABLE "Investment"
    ADD CONSTRAINT "Investment_shareholderId_fkey"
    FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Investment"
    ADD CONSTRAINT "Investment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProfitDistribution" (
    "id"             TEXT                 NOT NULL,
    "label"          TEXT                 NOT NULL,
    "periodStart"    DATE                 NOT NULL,
    "periodEnd"      DATE                 NOT NULL,
    "shareholderId"  TEXT                 NOT NULL,
    "netProfitCents" INTEGER              NOT NULL,
    "basisPoints"    INTEGER              NOT NULL,
    "amountCents"    INTEGER              NOT NULL,
    "status"         "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt"         TIMESTAMP(3),
    "reference"      TEXT,
    "notes"          TEXT,
    "createdById"    TEXT                 NOT NULL,
    "createdAt"      TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)         NOT NULL,
    CONSTRAINT "ProfitDistribution_pkey" PRIMARY KEY ("id")
);
-- One declaration per shareholder per period.
CREATE UNIQUE INDEX "ProfitDistribution_periodStart_periodEnd_shareholderId_key"
    ON "ProfitDistribution"("periodStart", "periodEnd", "shareholderId");
CREATE INDEX "ProfitDistribution_status_idx"      ON "ProfitDistribution"("status");
CREATE INDEX "ProfitDistribution_periodStart_idx" ON "ProfitDistribution"("periodStart");
ALTER TABLE "ProfitDistribution"
    ADD CONSTRAINT "ProfitDistribution_shareholderId_fkey"
    FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitDistribution"
    ADD CONSTRAINT "ProfitDistribution_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
