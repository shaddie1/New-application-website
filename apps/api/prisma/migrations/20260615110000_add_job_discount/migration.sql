-- Add discount field to Job for tracking price reductions given to clients.
ALTER TABLE "Job" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
