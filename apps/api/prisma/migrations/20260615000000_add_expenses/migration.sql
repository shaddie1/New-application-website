-- Add ExpenseCategory enum and Expense table for operational cost tracking.

CREATE TYPE "ExpenseCategory" AS ENUM ('MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS');

CREATE TABLE "Expense" (
    "id"          TEXT             NOT NULL,
    "category"    "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER          NOT NULL,
    "description" TEXT,
    "date"        DATE             NOT NULL,
    "bookingId"   TEXT,
    "createdById" TEXT             NOT NULL,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_date_idx"        ON "Expense"("date");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
