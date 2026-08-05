-- Company documents: governance and compliance records, visible only to the
-- owner and people actually on the cap table.
--
-- fileUrl holds either an uploaded object in our storage or an external link,
-- so the feature works whether or not object storage is configured.

CREATE TYPE "DocumentCategory" AS ENUM (
    'INCORPORATION', 'TAX', 'LICENCE', 'INSURANCE', 'CONTRACT', 'BANK', 'POLICY', 'MINUTES', 'OTHER'
);

CREATE TABLE "CompanyDocument" (
    "id"           TEXT               NOT NULL,
    "title"        TEXT               NOT NULL,
    "category"     "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "description"  TEXT,
    "fileUrl"      TEXT               NOT NULL,
    "fileName"     TEXT,
    "contentType"  TEXT,
    "sizeBytes"    INTEGER,
    "isExternal"   BOOLEAN            NOT NULL DEFAULT false,
    "expiresAt"    DATE,
    "uploadedById" TEXT               NOT NULL,
    "createdAt"    TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)       NOT NULL,
    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyDocument_category_idx"  ON "CompanyDocument"("category");
CREATE INDEX "CompanyDocument_expiresAt_idx" ON "CompanyDocument"("expiresAt");

ALTER TABLE "CompanyDocument"
    ADD CONSTRAINT "CompanyDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
