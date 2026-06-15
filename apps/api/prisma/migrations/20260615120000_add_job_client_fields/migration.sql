-- Add client contact fields to Job for tracking who the job was for.
ALTER TABLE "Job" ADD COLUMN "clientName"     TEXT;
ALTER TABLE "Job" ADD COLUMN "clientPhone"    TEXT;
ALTER TABLE "Job" ADD COLUMN "clientLocation" TEXT;
