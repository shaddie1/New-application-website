-- Add the cap table: who owns what share of the company.
-- Stakes are stored in basis points (10000 = 100.00%) so they sum exactly,
-- for the same reason money is stored in cents.

CREATE TYPE "ShareholderKind" AS ENUM ('COMPANY', 'INDIVIDUAL');

CREATE TABLE "Shareholder" (
    "id"          TEXT              NOT NULL,
    "name"        TEXT              NOT NULL,
    "kind"        "ShareholderKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "basisPoints" INTEGER           NOT NULL,
    "notes"       TEXT,
    "userId"      TEXT,
    "sortOrder"   INTEGER           NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shareholder_userId_key" ON "Shareholder"("userId");
CREATE INDEX "Shareholder_sortOrder_idx" ON "Shareholder"("sortOrder");

ALTER TABLE "Shareholder"
    ADD CONSTRAINT "Shareholder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the founding cap table: 40 / 30 / 30.
-- These are editable in the admin Ownership screen; this is only the starting state.
INSERT INTO "Shareholder" ("id", "name", "kind", "basisPoints", "sortOrder", "updatedAt") VALUES
    ('shr_company',  'OnyxHawk (Company)', 'COMPANY',    4000, 0, CURRENT_TIMESTAMP),
    ('shr_director', 'Director',           'INDIVIDUAL', 3000, 1, CURRENT_TIMESTAMP),
    ('shr_zecharia', 'Zecharia Mwangi',    'INDIVIDUAL', 3000, 2, CURRENT_TIMESTAMP);
