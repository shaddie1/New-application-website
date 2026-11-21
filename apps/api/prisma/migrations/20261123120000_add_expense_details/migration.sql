-- An expense can say what its amount is made of: a quantity, the unit it is
-- counted in, and the price for one. "quantityThousandths" counts in
-- thousandths, so 2500 is two and a half. "amountCents" is unchanged and is
-- still the only figure any total adds up; the new columns explain it.
--
-- Safe on a live database: three new nullable columns and one check. No
-- existing row changes: every expense keeps its amount, and has no quantity,
-- unit or price until someone enters one, so the check holds for all of them.
-- An API still serving during a deploy never reads or writes these columns.
-- Must sort after 20261122120000_add_project_money_split.

-- AlterTable
ALTER TABLE "Expense"
  ADD COLUMN "quantityThousandths" INTEGER,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "unitPriceCents" INTEGER;

-- A quantity and a price for one come together, both above zero, or not at
-- all; a unit is kept only beside them.
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_detail_check" CHECK (
    ("quantityThousandths" IS NULL AND "unitPriceCents" IS NULL AND "unit" IS NULL)
    OR ("quantityThousandths" > 0 AND "unitPriceCents" > 0)
  );
