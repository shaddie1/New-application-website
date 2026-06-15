-- Add Job table for per-job income & expense tracking.

CREATE TABLE "Job" (
    "id"          TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "date"        DATE         NOT NULL,
    "incomeCents" INTEGER      NOT NULL DEFAULT 0,
    "notes"       TEXT,
    "createdById" TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Job_date_idx"        ON "Job"("date");
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");

ALTER TABLE "Job"
    ADD CONSTRAINT "Job_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Link expenses to jobs (nullable — existing standalone expenses stay as-is).
ALTER TABLE "Expense" ADD COLUMN "jobId" TEXT;

CREATE INDEX "Expense_jobId_idx" ON "Expense"("jobId");

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
