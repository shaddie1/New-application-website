-- Shareholder removal date: a holder taken off the cap table keeps their row,
-- so the payouts declared for them keep their name. The row carries the date
-- it was removed, and every read of current holders leaves it out.

-- AlterTable
ALTER TABLE "Shareholder"
  ADD COLUMN "removedAt" TIMESTAMP(3);
