-- Add JobStatus enum and reporting fields to Job.
-- OWNER_ENTRY = created directly by owner (always counted).
-- PENDING     = submitted by a non-owner admin, awaiting approval.
-- APPROVED    = owner approved an admin submission (counted in financials).

CREATE TYPE "JobStatus" AS ENUM ('OWNER_ENTRY', 'PENDING', 'APPROVED');

ALTER TABLE "Job"
  ADD COLUMN "status"       "JobStatus" NOT NULL DEFAULT 'OWNER_ENTRY',
  ADD COLUMN "reportedById" TEXT        REFERENCES "User"("id");

CREATE INDEX "Job_status_idx" ON "Job"("status");
