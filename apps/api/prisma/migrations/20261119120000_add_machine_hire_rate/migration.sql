-- Two daily rates per machine: the existing rate becomes the project rate,
-- for days on the company's own jobs, and a new hire rate is for days hired
-- out to a client. The project rate keeps the "dailyRateCents" column, so an
-- API still serving during a deploy reads and writes the same column.
--
-- "hireRateReviewedAt" is when the owner last saved a machine's rates. It is
-- left empty for every machine here, which marks each one "hire rate not
-- reviewed" until the owner saves its rates.
--
-- On a machine line, "standardRateCents" is the machine's own rate when the
-- line was made, beside the rate it used. Lines made before this have none,
-- and are never shown as given a different rate. "hirePaidOn" and
-- "hirePaymentRef" are a hire's paid mark, which changes no figure.
--
-- Safe on a live database: five new nullable columns, then each machine's
-- rate is copied into its hire rate. No other row or column changes: every
-- line keeps its rate, days and amount, and every hire job keeps its income.
-- Must sort after 20261118120000_add_machine_register.

-- AlterTable
ALTER TABLE "Asset"
  ADD COLUMN "hireRateCents" INTEGER,
  ADD COLUMN "hireRateReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MachineLine"
  ADD COLUMN "standardRateCents" INTEGER,
  ADD COLUMN "hirePaidOn" DATE,
  ADD COLUMN "hirePaymentRef" TEXT;

-- A machine that had one rate keeps it as both rates.
UPDATE "Asset" SET "hireRateCents" = "dailyRateCents" WHERE "dailyRateCents" IS NOT NULL;
