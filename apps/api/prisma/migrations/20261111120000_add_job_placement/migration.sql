-- Job placement: where each job sits for per-project money. A job is under one
-- project, a one-off (STANDALONE), or not yet sorted. Every existing job starts
-- as UNSORTED, and the owner sorts them afterwards.
--
-- The project link refuses deletion (RESTRICT), so a project that holds jobs
-- cannot be deleted and take money records with it. The check keeps the two
-- columns in step: a link exists exactly when the placement is PROJECT.
--
-- Safe on a live database: one new enum, two new columns (one defaulted, one
-- nullable), one index and two constraints that every existing row satisfies.
-- Must sort after 20261102120000_add_quote_costing.

-- CreateEnum
CREATE TYPE "JobPlacement" AS ENUM ('UNSORTED', 'PROJECT', 'STANDALONE');

-- AlterTable
ALTER TABLE "Job"
  ADD COLUMN "placement" "JobPlacement" NOT NULL DEFAULT 'UNSORTED',
  ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Job_projectId_idx" ON "Job"("projectId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE "Job" ADD CONSTRAINT "Job_placement_project_check" CHECK (("placement" = 'PROJECT') = ("projectId" IS NOT NULL));
