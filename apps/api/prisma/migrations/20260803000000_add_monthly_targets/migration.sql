-- Monthly targets the dashboard measures actuals against.

CREATE TABLE "MonthlyTarget" (
    "id"                   TEXT         NOT NULL,
    "year"                 INTEGER      NOT NULL,
    "month"                INTEGER      NOT NULL,
    "revenueTargetCents"   INTEGER      NOT NULL DEFAULT 0,
    "netProfitTargetCents" INTEGER      NOT NULL DEFAULT 0,
    "jobsTarget"           INTEGER      NOT NULL DEFAULT 0,
    "notes"                TEXT,
    "createdById"          TEXT         NOT NULL,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonthlyTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyTarget_year_month_key" ON "MonthlyTarget"("year", "month");
CREATE INDEX "MonthlyTarget_year_idx" ON "MonthlyTarget"("year");

ALTER TABLE "MonthlyTarget"
    ADD CONSTRAINT "MonthlyTarget_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
