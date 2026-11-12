-- Shareholder removal date: a holder taken off the cap table keeps their row,
-- so the payouts declared for them keep their name. The row carries the date
-- it was removed, and every read of current holders leaves it out.
--
-- Safe on a live database: one new nullable column. Every existing row stays
-- a current holder (NULL), and no stake changes.
-- Must sort after 20261111120000_add_job_placement.

-- AlterTable
ALTER TABLE "Shareholder"
  ADD COLUMN "removedAt" TIMESTAMP(3);
